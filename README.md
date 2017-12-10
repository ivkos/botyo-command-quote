# Quote Command for Botyo
[![npm](https://img.shields.io/npm/v/botyo-command-quote.svg)](https://www.npmjs.com/package/botyo-command-quote)
[![npm](https://img.shields.io/npm/dt/botyo-command-quote.svg)](https://www.npmjs.com/package/botyo-command-quote)
[![npm](https://img.shields.io/npm/l/botyo-command-quote.svg)]()

The **Quote Command for [Botyo](https://github.com/ivkos/botyo)** uses Markov chains to generate quotes based on messages sent by the participants of a chat thread.

## Requirements
* [Persistence Bundle](https://github.com/ivkos/botyo-bundle-persistence) - must be configured and enabled to store the messages in the database, since the Quote Command generates sentences based on messages in DB in order to avoid downloading the entire chat history on every command invocation.

## Install
**Step 1.** Install the module from npm.

`npm install --save botyo-command-quote`

**Step 2.** Register the module.
```typescript
import Botyo from "botyo";
import { QuoteCommand } from "botyo-command-quote"

Botyo.builder()
    ...
    .registerModule(QuoteCommand)
    ...
    .build()
    .start();
```

## Configuration
The configuration of the module has sensible defaults and doesn't need to be explicitly configured.
However, you can still override the defaults in your configuration file or upon module registration.

```yaml
modules:
    QuoteCommand:
      enable: true
      markov:
        vom: true         # whether to build a variable-order Markov model
        order: 2          # order of the Markov model
        maxWordCount: 20  # limit for the generated sentence's word count
      censorship:
        enable: false     # whether to censor (i.e. not send) sentences matching the following regex, and generate new ones instead
        regex: "/badword|worseword/gi"   # JavaScript regex
        maxRetries: 20    # how many times to retry generating new sentences until finding one that doesn't get censored
```