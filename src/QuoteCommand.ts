import { ChatApi, CommandModule, FacebookId, Message, MongoDb } from "botyo-api";
import { inject } from "inversify";

const Markovski = require("markovski");

export default class QuoteCommand extends CommandModule
{
    private readonly api: ChatApi;
    private readonly prefix: string;

    private readonly markovVom: boolean;
    private readonly markovOrder: number;
    private readonly markovMaxWordCount: number;
    private readonly censorshipEnabled: boolean;
    private readonly censorshipRegex: RegExp;
    private readonly censorshipMaxRetries: number;

    constructor(@inject(MongoDb) private readonly db: any)
    {
        super();

        const runtime = this.getRuntime();
        this.api = runtime.getChatApi();

        // TODO Refactor this for more reliability
        this.prefix = runtime.getApplicationConfiguration().getOrElse("CommandExecutorFilter.prefix", "#");

        const config = runtime.getConfiguration();
        this.markovVom = config.getOrElse("markov.vom", true);
        this.markovOrder = config.getOrElse("markov.order", 2);
        this.markovMaxWordCount = config.getOrElse("markov.maxWordCount", 20);

        this.censorshipEnabled = config.getOrElse("censorship.enable", false);
        this.censorshipRegex = QuoteCommand.parseRegex(config.getOrElse("censorship.regex", "/badword|worseword/gi"));
        this.censorshipMaxRetries = config.getOrElse("censorship.maxRetries", 20);
    }

    getCommand(): string
    {
        return "quote";
    }

    getDescription(): string
    {
        return "Generates a quote";
    }

    getUsage(): string
    {
        return "[ <person> | me | all [ on <subject> ] ]";
    }

    validate(msg: Message, args: string): boolean
    {
        return true;
    }

    async execute(msg: Message, argsString: string): Promise<any>
    {
        const threadId = msg.threadID;
        const quoteeId = this.getQuoteeId(msg, argsString);

        if (quoteeId === undefined) {
            return this.api.sendMessage(threadId, "Literally who?");
        }

        if (quoteeId == this.api.getCurrentUserId()) {
            return this.api.sendMessage(threadId, "\u{1F635}");
        }

        let subject: string | undefined;
        {
            const matches = argsString.match(QuoteCommand.QUOTE_ON_REGEX);
            if (matches == null || matches.length < 3) {
                subject = undefined;
            } else {
                subject = matches[2].trim().toLowerCase();
            }
        }

        const quoteeName = quoteeId === -1 ? "\u{1F464}" : this.getRuntime().getChatThreadUtils().getName(quoteeId);
        const messages = (await this.getMessagesFromDb(threadId, quoteeId))
            .map(m => m.body);
        const sentence = this.buildMarkovSentence(messages, subject);

        const result: string = !sentence ? "\u{1F4AC}\u{2753}" :
            `“${sentence}”\n` +
            `– ${quoteeName}`;

        return this.api.sendMessage(threadId, result);
    }

    private getQuoteeId(msg: Message, args: string)
    {
        if (!args || args.length == 0) {
            return msg.senderID;
        }

        const argsNormalized = args
            .replace(QuoteCommand.QUOTE_ON_REGEX, "")
            .trim()
            .toLowerCase();

        if (argsNormalized === "me") {
            return msg.senderID;
        }

        if (argsNormalized === "all" || argsNormalized === "*") {
            return -1;
        }

        return this.getRuntime().getChatThreadUtils().getParticipantIdByAddressee(msg.threadID, argsNormalized);
    }

    private createMarkovski()
    {
        const singlePunctuation = new RegExp(/^[,.;:!?\(\)]$/);

        return new Markovski(this.markovOrder, this.markovVom)
            .lowerCaseModelKeys(true)
            .wordNormalizer((word: string) => word.replace(/[.,!?]+$/ig, ''))
            .sentenceToWordsSplitter((sentence: string) => sentence
                .split(/\s/)
                .map(w => w.trim())
                .filter(w => w.length > 0)
                .filter(w => !singlePunctuation.test(w)))
            .endWhen(this.markovMaxWordCount);
    }

    private async getMessagesFromDb(threadId: FacebookId, quoteeId: FacebookId): Promise<Message[]>
    {
        const filterList = [];
        if (quoteeId !== -1) {
            filterList.push({
                $or: [
                    { senderID: "fbid:" + quoteeId },
                    { senderID: "" + quoteeId }
                ]
            });
        } else {
            const currentUserId = this.api.getCurrentUserId();

            // messages by everyone but the bot
            filterList.push({
                $and: [
                    { senderID: { $ne: "fbid:" + currentUserId } },
                    { senderID: { $ne: "" + currentUserId } }
                ]
            });
        }

        filterList.push(
            { type: "message" },
            { attachments: { $size: 0 } },
            { body: { $exists: true } },
            { body: { $ne: "" } },
            { body: new RegExp("^(?!" + this.prefix + ").+$") } // skip messages that start with command symbol
        );

        return this.db
            .collection(`thread-${threadId}`)
            .find({ "$and": filterList })
            .toArray();
    }

    private buildMarkovSentence(messages: string[], subject?: string): string | undefined
    {
        const markovski = this.createMarkovski();

        if (subject) {
            markovski.startWith(subject);
        }

        messages.forEach(m => markovski.train(m));

        let sentence;
        if (!this.censorshipEnabled) {
            sentence = markovski.generate();
        } else {
            for (let tries = 0; tries < this.censorshipMaxRetries; tries++) {
                const candidate = markovski.generate();

                if (!this.censorshipRegex.test(candidate)) {
                    sentence = candidate;
                    break;
                }

                this.getRuntime().getLogger().warn(`Sentence '${candidate}' will not be sent due to censorship`);
            }
        }

        if (sentence == subject) return;

        return sentence;
    }

    private static parseRegex(str: string): RegExp
    {
        const matches = str.match(new RegExp('^/(.*?)/([gimuy]*)$'));
        if (matches === null) throw new Error("This not a valid regex: " + str);

        return new RegExp(matches[1], matches[2]);
    }

    private static readonly QUOTE_ON_REGEX = /\s+(on\s+(.+))$/ui;
}