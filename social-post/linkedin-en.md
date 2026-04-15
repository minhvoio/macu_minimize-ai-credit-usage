I was mass burning tokens and had no idea.

Every message I sent to Claude, OpenCode, or Codex was carrying 95 tool definitions.

I only used 35 of them.

That's 28,000 tokens of dead weight - on every single request.

32% of my input budget, gone before I typed a word.

So I dug into the data.

50 days. 830 sessions. 33,000 tool calls.

60 tools with zero or near-zero usage.

Millions of tokens wasted.

The fix wasn't complicated.

Remove what you don't use.

But finding what you don't use - that's the hard part.

So I built macu.

One command. It reads your usage data across Claude Code, OpenCode, and Codex.

Shows you what tools you actually call.

Shows you what's just sitting there eating tokens.

Gives you a before-and-after.

And an action plan your AI agent can execute directly.

No config files to read. No manual auditing.

Run it inside your AI session. The agent does the rest.

It's open source.

github.com/minhvoio/macu_minimize-ai-credit-usage

If you're running AI coding tools with MCP plugins, you're probably burning tokens the same way I was.

Takes 30 seconds to find out.
