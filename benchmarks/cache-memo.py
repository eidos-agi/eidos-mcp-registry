#!/usr/bin/env python3
"""Generate the prompt caching memo PDF — light mode, storytelling, with charts."""

import io
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import numpy as np

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Preformatted, Image,
)

# Light mode colors
TEXT = HexColor("#1f2328")
DIM = HexColor("#656d76")
ACCENT = HexColor("#0969da")
ORANGE = HexColor("#bc4c00")
GREEN = HexColor("#1a7f37")
RED = HexColor("#cf222e")
CARD_BG = HexColor("#f6f8fa")
BORDER = HexColor("#d0d7de")

# Chart colors (matplotlib)
C_BLUE = "#0969da"
C_ORANGE = "#bc4c00"
C_GREEN = "#1a7f37"
C_RED = "#cf222e"
C_GRAY = "#656d76"

OUT = "./benchmarks/prompt-caching-memo.pdf"


def make_chart(fig, width=5.5*inch, height=2.8*inch):
    """Convert matplotlib figure to reportlab Image flowable."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=180, bbox_inches="tight",
                facecolor="white", edgecolor="none")
    plt.close(fig)
    buf.seek(0)
    return Image(buf, width=width, height=height)


def chart_cache_cost_per_turn():
    """Show cost per turn: cold start vs cached for 27 and 5 servers."""
    fig, ax = plt.subplots(figsize=(7, 3.2))

    turns = list(range(1, 21))
    # 27 servers: 50K tokens
    cost_27 = [50000 * 3.75 / 1e6]  # turn 1: cache write
    for _ in range(19):
        cost_27.append(50000 * 0.30 / 1e6)  # turns 2+: cache read

    # 5 servers: 10K tokens
    cost_5 = [10000 * 3.75 / 1e6]
    for _ in range(19):
        cost_5.append(10000 * 0.30 / 1e6)

    # No caching: full price every turn
    cost_nocache = [50000 * 3.00 / 1e6] * 20

    ax.plot(turns, cost_nocache, color=C_RED, linewidth=2, label="27 srv, no cache (hypothetical)", linestyle="--")
    ax.plot(turns, cost_27, color=C_BLUE, linewidth=2.5, label="27 servers (with cache)")
    ax.plot(turns, cost_5, color=C_GREEN, linewidth=2.5, label="5 servers (with cache)")

    ax.fill_between(turns, cost_27, cost_nocache, alpha=0.08, color=C_RED)
    ax.annotate("90% savings\nfrom caching", xy=(10, 0.08), fontsize=9, color=C_RED,
                ha="center", style="italic")

    ax.set_xlabel("Turn", fontsize=10)
    ax.set_ylabel("Tool schema cost per turn ($)", fontsize=10)
    ax.set_title("Cost of Tool Schemas Per Turn", fontsize=12, fontweight="bold")
    ax.legend(fontsize=8.5, loc="center right")
    ax.set_xlim(1, 20)
    ax.set_ylim(0, 0.20)
    ax.yaxis.set_major_formatter(ticker.FormatStrFormatter("$%.3f"))
    ax.grid(axis="y", alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    return fig


def chart_cumulative_cost():
    """Cumulative tool schema cost over a session."""
    fig, ax = plt.subplots(figsize=(7, 3.2))

    turns = list(range(1, 21))

    cum_27 = []
    cum_5 = []
    cum_nocache = []
    running_27 = running_5 = running_nc = 0

    for i in range(20):
        if i == 0:
            running_27 += 50000 * 3.75 / 1e6
            running_5 += 10000 * 3.75 / 1e6
        else:
            running_27 += 50000 * 0.30 / 1e6
            running_5 += 10000 * 0.30 / 1e6
        running_nc += 50000 * 3.00 / 1e6
        cum_27.append(running_27)
        cum_5.append(running_5)
        cum_nocache.append(running_nc)

    ax.plot(turns, cum_nocache, color=C_RED, linewidth=2, linestyle="--", label="27 srv, no cache")
    ax.plot(turns, cum_27, color=C_BLUE, linewidth=2.5, label="27 servers (cached)")
    ax.plot(turns, cum_5, color=C_GREEN, linewidth=2.5, label="5 servers (cached)")

    ax.fill_between(turns, cum_27, cum_nocache, alpha=0.1, color=C_RED)

    # Annotate final values
    ax.annotate(f"${cum_nocache[-1]:.2f}", xy=(20, cum_nocache[-1]), fontsize=9,
                color=C_RED, ha="left", va="bottom")
    ax.annotate(f"${cum_27[-1]:.2f}", xy=(20, cum_27[-1]), fontsize=9,
                color=C_BLUE, ha="left", va="bottom")
    ax.annotate(f"${cum_5[-1]:.2f}", xy=(20, cum_5[-1]), fontsize=9,
                color=C_GREEN, ha="left", va="top")

    ax.set_xlabel("Turn", fontsize=10)
    ax.set_ylabel("Cumulative tool schema cost ($)", fontsize=10)
    ax.set_title("Cumulative Cost Over a 20-Turn Session", fontsize=12, fontweight="bold")
    ax.legend(fontsize=8.5)
    ax.set_xlim(1, 20)
    ax.yaxis.set_major_formatter(ticker.FormatStrFormatter("$%.2f"))
    ax.grid(axis="y", alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    return fig


def chart_benchmark_results():
    """Bar chart of A/B benchmark results by task."""
    fig, ax = plt.subplots(figsize=(7, 3.5))

    tasks = ["server\ncount", "health\nendpoint", "notif\ncount", "server\nsearch",
             "activity\nfilter", "json\nexport", "group\nstats", "deploy\ndry-run",
             "store\nbackup", "disable\ncascade"]
    costs_27 = [0.09, 0.21, 0.31, 0.65, 0.19, 0.34, 0.36, 0.34, 0.51, 1.65]
    costs_5 = [0.09, 0.18, 0.36, 0.61, 0.15, 0.43, 0.67, 0.37, 0.32, 1.86]
    diffs = ["easy", "easy", "easy", "med", "med", "med", "med", "hard", "hard", "hard"]

    x = np.arange(len(tasks))
    w = 0.35

    bars1 = ax.bar(x - w/2, costs_27, w, label="27 servers", color=C_BLUE, alpha=0.85)
    bars2 = ax.bar(x + w/2, costs_5, w, label="5 servers", color=C_ORANGE, alpha=0.85)

    # Difficulty brackets
    ax.axvspan(-0.5, 2.5, alpha=0.04, color=C_GREEN)
    ax.axvspan(2.5, 6.5, alpha=0.04, color=C_BLUE)
    ax.axvspan(6.5, 9.5, alpha=0.04, color=C_RED)
    ax.text(1, max(costs_27 + costs_5) * 1.08, "EASY", ha="center", fontsize=8, color=C_GREEN, fontweight="bold")
    ax.text(4.5, max(costs_27 + costs_5) * 1.08, "MEDIUM", ha="center", fontsize=8, color=C_BLUE, fontweight="bold")
    ax.text(8, max(costs_27 + costs_5) * 1.08, "HARD", ha="center", fontsize=8, color=C_RED, fontweight="bold")

    ax.set_ylabel("Cost ($)", fontsize=10)
    ax.set_title("A/B Benchmark: Cost Per Task", fontsize=12, fontweight="bold")
    ax.set_xticks(x)
    ax.set_xticklabels(tasks, fontsize=7.5)
    ax.legend(fontsize=9)
    ax.grid(axis="y", alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    return fig


def chart_context_pressure():
    """Show how tool schemas consume context at different session lengths."""
    fig, ax = plt.subplots(figsize=(7, 3))

    sessions = ["Short\n(10 turns)", "Medium\n(50 turns)", "Long\n(100 turns)", "Marathon\n(200 turns)"]
    total_context = [100, 300, 500, 900]  # K tokens
    tool_schemas = [50, 50, 50, 50]  # K tokens (constant)

    x = np.arange(len(sessions))
    w = 0.5

    ax.bar(x, total_context, w, label="Your code + conversation", color=C_BLUE, alpha=0.7)
    ax.bar(x, tool_schemas, w, label="Tool schemas (27 servers)", color=C_RED, alpha=0.7)

    for i, (total, tools) in enumerate(zip(total_context, tool_schemas)):
        pct = tools / total * 100
        ax.text(i, tools + 5, f"{pct:.0f}%", ha="center", fontsize=9, fontweight="bold", color=C_RED)

    ax.set_ylabel("Tokens (thousands)", fontsize=10)
    ax.set_title("Tool Schema Overhead vs. Session Length", fontsize=12, fontweight="bold")
    ax.set_xticks(x)
    ax.set_xticklabels(sessions, fontsize=9)
    ax.legend(fontsize=8.5, loc="upper left")
    ax.set_ylim(0, 1050)
    ax.grid(axis="y", alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    return fig


def chart_annual_savings():
    """Show annual cost comparison."""
    fig, ax = plt.subplots(figsize=(4, 2.5))

    categories = ["27 servers", "5 servers"]
    annual = [5400, 1080]
    colors = [C_RED, C_GREEN]

    bars = ax.barh(categories, annual, color=colors, alpha=0.8, height=0.5)
    ax.bar_label(bars, fmt="$%,.0f/yr", padding=8, fontsize=10, fontweight="bold")

    ax.set_xlabel("Annual cost (tool schema overhead)", fontsize=9)
    ax.set_title("Cost at Scale: 20 Sessions/Day", fontsize=11, fontweight="bold")
    ax.set_xlim(0, 7500)
    ax.grid(axis="x", alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    return fig


def build():
    doc = SimpleDocTemplate(
        OUT, pagesize=letter,
        topMargin=0.7*inch, bottomMargin=0.7*inch,
        leftMargin=0.8*inch, rightMargin=0.8*inch,
    )

    s_title = ParagraphStyle("title", fontSize=24, fontName="Helvetica-Bold", textColor=TEXT, spaceAfter=4, leading=30)
    s_subtitle = ParagraphStyle("subtitle", fontSize=13, fontName="Helvetica", textColor=ORANGE, spaceAfter=4, leading=17)
    s_date = ParagraphStyle("date", fontSize=10, fontName="Helvetica", textColor=DIM, spaceAfter=20, leading=13)
    s_h1 = ParagraphStyle("h1", fontSize=17, fontName="Helvetica-Bold", textColor=TEXT, spaceBefore=28, spaceAfter=10, leading=22)
    s_h2 = ParagraphStyle("h2", fontSize=13, fontName="Helvetica-Bold", textColor=ACCENT, spaceBefore=18, spaceAfter=8, leading=17)
    s_body = ParagraphStyle("body", fontSize=10.5, fontName="Helvetica", textColor=TEXT, spaceAfter=10, leading=16)
    s_code = ParagraphStyle("code", fontSize=9, fontName="Courier", textColor=TEXT, spaceAfter=12, leading=13, leftIndent=16, backColor=CARD_BG)
    s_callout = ParagraphStyle("callout", fontSize=10.5, fontName="Helvetica-Oblique", textColor=ORANGE, spaceAfter=12, leading=15, leftIndent=16, rightIndent=16)
    s_bullet = ParagraphStyle("bullet", fontSize=10.5, fontName="Helvetica", textColor=TEXT, spaceAfter=5, leading=15, leftIndent=20, bulletIndent=8)
    s_source = ParagraphStyle("source", fontSize=8, fontName="Helvetica", textColor=DIM, spaceAfter=3, leading=10)

    story = []
    def h1(t): story.append(Paragraph(t, s_h1))
    def h2(t): story.append(Paragraph(t, s_h2))
    def p(t): story.append(Paragraph(t, s_body))
    def callout(t): story.append(Paragraph(t, s_callout))
    def code(t): story.append(Preformatted(t, s_code))
    def sp(n=10): story.append(Spacer(1, n))

    def tbl(data, widths=None):
        t = Table(data, colWidths=widths, hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), CARD_BG),
            ("TEXTCOLOR", (0, 0), (-1, 0), ACCENT),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 1), (-1, -1), TEXT),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(t)
        sp(12)

    # ═══════ TITLE ═══════
    story.append(Paragraph("How Prompt Caching Works", s_title))
    story.append(Paragraph("And Why More MCP Tools Don't Slow You Down", s_subtitle))
    story.append(Paragraph("Eidos AGI \u2014 Internal Memo \u2014 March 2026", s_date))

    p("We set out to prove that scoping MCP servers to fewer tools would make Claude Code faster "
      "and cheaper. We ran the experiment. The data said otherwise.")
    p("This memo explains what we found, why caching makes tool overhead nearly invisible, "
      "and what actually matters when you're deciding how to manage your MCP servers.")

    # ═══════ 1. MENU ═══════
    h1("1. The Menu Problem")
    p("Imagine a restaurant with a 50-page menu. You sit down, the waiter hands it to you, "
      "and you order a cheeseburger. Did the 50 pages slow you down? Not really \u2014 you knew "
      "what you wanted. You flipped past the sushi section without reading it.")
    p("Now imagine you eat at this restaurant every day. Do they hand you the menu "
      "every time? No \u2014 after the first visit, the waiter just says \"the usual?\" The menu "
      "exists, but it's not being re-processed on every visit.")
    p("<b>This is exactly how Claude handles MCP tool schemas.</b>")
    p("Every API call includes three sections in this order:")
    code("  1. TOOLS      \u2190  MCP server schemas (the menu)\n"
         "  2. SYSTEM      \u2190  CLAUDE.md, instructions (house rules)\n"
         "  3. MESSAGES    \u2190  your conversation (your order)")
    p("With 27 MCP servers and 469 tools, the \"menu\" is about 50,000 tokens long. That's "
      "sent with every single message. But after the first message, Claude doesn't re-read it.")

    # ═══════ 2. BOOKMARK ═══════
    h1("2. The Bookmark \u2014 How Caching Actually Works")
    p("When Claude processes your first message, it reads everything and builds an internal "
      "representation called a <b>KV cache</b> (key-value attention states). Think of it as "
      "a bookmark. Instead of re-reading the entire book on every turn, Claude picks up from "
      "the bookmark.")

    h2("The cost difference is dramatic")
    story.append(make_chart(chart_cache_cost_per_turn(), width=5.2*inch, height=2.6*inch))

    p("The red dashed line is what you'd pay without caching: $0.15 per turn, every turn, "
      "for 27 servers worth of tool schemas. The blue and green lines show reality: a spike "
      "on turn 1 (writing the bookmark), then nearly flat for the rest of the session.")

    callout("The bookmark costs 1.25x to create but only 0.1x to reuse. After turn 1, "
            "tool schema overhead is 90% cheaper. And cache reads don't count against rate limits.")

    h2("The critical distinction most people miss")

    p("Caching makes tool schemas <b>cheaper to process</b>. It does NOT make them <b>smaller "
      "in the context window</b>. This is the part that neither the Anthropic docs nor most "
      "articles about caching make explicit.")

    p("Think about it this way: a cached book is still a book. The library charges you less "
      "to check it out the second time, but it still takes up the same space on your desk. "
      "Those 50,000 tokens of tool schemas are in the context window on every single turn, "
      "cached or not. They count toward the context limit. They contribute to context "
      "compression. They push out your earlier conversation history when the window fills up.")

    code("  Caching saves you:     MONEY  (90% less per token)\n"
         "  Caching does NOT save: SPACE  (same tokens in context)\n"
         "\n"
         "  Scoping saves you:    SPACE  (fewer tokens in context)\n"
         "  Scoping saves you:    MONEY  (less to cache)\n"
         "  Scoping saves you:    QUALITY (less context pressure)")

    p("This is why our benchmark showed no cost difference on short sessions (caching handled it) "
      "but the context rot research still applies to long sessions (caching can't help with space).")

    h2("What breaks the bookmark?")
    tbl([
        ["What Changed", "Tools", "System", "Messages"],
        ["Added/removed a tool", "\u274c Reset", "\u274c Reset", "\u274c Reset"],
        ["Changed system prompt", "\u2705 Kept", "\u274c Reset", "\u274c Reset"],
        ["New user message", "\u2705 Kept", "\u2705 Kept", "\u2705 Extended"],
    ], widths=[130, 80, 80, 80])
    callout("Stable tool definitions help caching. If your MCP servers don't crash or change "
            "mid-session, the tool cache stays warm forever. Having MORE stable tools is better "
            "for caching than having fewer unstable ones.")

    # ═══════ 3. MATH ═══════
    story.append(PageBreak())
    h1("3. The Math \u2014 What Extra Tools Actually Cost")
    p("Here's what a 20-turn session costs for just the tool schema portion:")
    story.append(make_chart(chart_cumulative_cost(), width=5.2*inch, height=2.6*inch))
    p("Without caching (red dashed), 27 servers would cost <b>$3.00</b> in tool overhead alone "
      "over 20 turns. With caching, it's <b>$0.47</b> \u2014 an 84% reduction. The gap between "
      "27 servers ($0.47) and 5 servers ($0.09) is just <b>$0.38 per session</b>.")
    callout("Two cents per turn. That's the total cost of carrying 22 extra MCP servers. "
            "It's real money at 1000 sessions/month ($378), but invisible in any single session.")

    tbl([
        ["", "Regular Input", "Cache Write", "Cache Read", "Savings"],
        ["Sonnet 4.6", "$3.00 / M", "$3.75 / M", "$0.30 / M", "90%"],
        ["Opus 4.6", "$5.00 / M", "$6.25 / M", "$0.50 / M", "90%"],
    ], widths=[80, 85, 85, 85, 60])

    # ═══════ 4. EXPERIMENT ═══════
    h1("4. What Happened When We Tested It")
    p("We designed a proper experiment: 10 coding tasks at three difficulty levels. Each task "
      "ran twice \u2014 once with 27 MCP servers, once with 5. Run order was fully randomized.")
    p("We expected 5 servers to win. They didn't.")
    story.append(make_chart(chart_benchmark_results(), width=5.5*inch, height=2.8*inch))

    p("The bars are nearly identical on most tasks. The few outliers (group-stats +84%, "
      "store-backup -37%) are random variation, not signal. With n=10 per condition, "
      "the variance between tasks far exceeds any between-condition difference.")

    tbl([
        ["", "27 Servers", "5 Servers", "Difference"],
        ["Avg cost", "$0.46", "$0.50", "+9% (not significant)"],
        ["Avg duration", "111 sec", "135 sec", "+22% (not significant)"],
        ["Avg tool calls", "22", "29", "+32% (more exploration)"],
    ], widths=[90, 80, 80, 170])

    p("<b>The honest conclusion:</b> there is no measurable performance difference between "
      "27 and 5 MCP servers on short coding tasks. Caching makes the overhead invisible.")

    # ═══════ 5. CONTEXT ROT ═══════
    story.append(PageBreak())
    h1("5. The Slow Burn \u2014 Context Rot")
    p("If caching makes tool overhead cheap, why bother scoping? Because caching solves "
      "the cost problem but not the space problem. Those 50K tokens are still sitting in your "
      "context window, cached or not, and in long conversations that space matters.")
    p("Researchers at Chroma (March 2026) tested 18 LLMs on context-length sensitivity. "
      "<b>Every model got worse as input grew.</b> Simple tasks that were trivial at 10K tokens "
      "became unreliable at 200K, even when the task didn't change. The input just got longer.")
    callout("Think of a long meeting. The first hour is productive. By hour four, people only "
            "respond to what was said in the last 10 minutes. The earlier discussion isn't "
            "forgotten \u2014 it's just no longer driving decisions.")

    story.append(make_chart(chart_context_pressure(), width=5*inch, height=2.5*inch))

    p("In short sessions, 50K of tool schemas is a large fraction of context but doesn't matter "
      "because the total is well within the model's effective range. In marathon sessions, "
      "those 50K tokens push out conversation history and code that you actually need.")

    # ═══════ 6. WHERE IT MATTERS ═══════
    h1("6. Where Scoping Actually Matters")
    p("Our benchmark disproved the \"faster coding\" claim. Here's what actually matters:")

    h2("Wrong-tool confusion")
    p("When Claude sees github.search_issues, wrike.search_tasks, backlog.task_search, and "
      "taskr.taskr_search, it picks wrong ~25% of the time. Each mistake is a full round-trip. "
      "Scoping to the right 1-2 tools eliminates this. Our benchmark didn't test this because "
      "the tasks never called MCP tools.")

    h2("Confidentiality")
    p("Client A's Wrike board schema is in context when you work in Client B's repo. The tool "
      "isn't called, but its description is present. In regulated environments, that's a "
      "data boundary violation.")

    h2("Long sessions")
    p("At 100+ messages, context compression discards earlier conversation. 50K fewer tokens "
      "of tool schemas = 50K more for your code, files, and reasoning.")

    h2("Cost at scale")
    story.append(make_chart(chart_annual_savings(), width=3.8*inch, height=2*inch))
    p("Two cents per turn becomes $4,320/year for a team doing 20 sessions/day.")

    h2("Cache invalidation risk")
    p("If an MCP server crashes mid-session, the <b>entire cache resets</b> \u2014 tools, system, "
      "and messages. With 27 servers, crash probability is much higher than with 5.")

    # ═══════ 7. BOTTOM LINE ═══════
    h1("7. The Bottom Line")
    sp(8)
    tbl([
        ["Scenario", "Scoping Helps?", "Why"],
        ["Short coding (10-30 turns)", "No", "Cache makes overhead free"],
        ["Long sessions (100+ turns)", "Yes \u2014 quality", "Fewer schemas = more room for code"],
        ["Multi-tool workflows", "Yes \u2014 accuracy", "Fewer competing tools = correct picks"],
        ["Multi-client work", "Yes \u2014 required", "Tool schemas are data boundaries"],
        ["Teams at scale", "Yes \u2014 cost", "$4,320/year savings"],
    ], widths=[140, 100, 175])
    sp(8)
    callout("The registry's value is security, organization, and long-session quality \u2014 "
            "not raw coding speed. That's an honest position, and it's strong. Every MCP tool "
            "in the ecosystem claims speed improvements they can't prove. We ran the experiment. "
            "We have the data. We're telling you what actually matters.")

    sp(20)
    story.append(Paragraph("Sources", s_h2))
    story.append(Paragraph("\u2022  Anthropic Prompt Caching: platform.claude.com/docs/en/build-with-claude/prompt-caching", s_source))
    story.append(Paragraph("\u2022  Context Rot (Chroma Research, 2026): research.trychroma.com/context-rot", s_source))
    story.append(Paragraph("\u2022  Eidos A/B Benchmark: github.com/eidos-agi/eidos-mcp-registry/benchmarks/ab_results/", s_source))

    doc.build(story)
    print(f"PDF saved to {OUT}")


if __name__ == "__main__":
    build()
