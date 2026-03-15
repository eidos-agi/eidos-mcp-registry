"""
CLI for the MCP Registry daemon.

Usage:
    mcp-registry serve [--port 19285]
    mcp-registry status
    mcp-registry scan
    mcp-registry deploy [--dry-run]
    mcp-registry open
    mcp-registry servers
    mcp-registry groups
    mcp-registry assign SERVER GROUP
"""

import sys
import webbrowser
from pathlib import Path

import click
import httpx

DEFAULT_PORT = 19285
BASE_URL = f"http://localhost:{DEFAULT_PORT}"


def _client() -> httpx.Client:
    return httpx.Client(base_url=BASE_URL, timeout=30)


def _handle_error(e: Exception):
    if isinstance(e, httpx.ConnectError):
        click.echo("Error: daemon not running. Start with: mcp-registry serve", err=True)
    else:
        click.echo(f"Error: {e}", err=True)
    sys.exit(1)


@click.group()
def main():
    """Eidos MCP Registry — drag-and-drop MCP server scoping."""
    pass


@main.command()
@click.option("--port", default=DEFAULT_PORT, help="Port to listen on")
@click.option("--host", default="127.0.0.1", help="Host to bind to")
@click.option("--reload/--no-reload", default=True, help="Auto-reload on code changes")
def serve(port: int, host: str, reload: bool):
    """Start the registry daemon."""
    import socket
    import uvicorn

    # Check if port is already in use
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex((host, port)) == 0:
            click.echo(f"Error: port {port} already in use. Another daemon running?", err=True)
            click.echo(f"  Try: kill -9 $(lsof -ti:{port})", err=True)
            sys.exit(1)

    click.echo(f"Starting MCP Registry on {host}:{port}" + (" (reload)" if reload else ""))
    uvicorn.run(
        "mcp_registry.server:app",
        host=host, port=port, log_level="info",
        reload=reload,
        reload_dirs=[str(Path(__file__).parent.parent)] if reload else None,
    )


@main.command()
def status():
    """Show daemon status."""
    try:
        with _client() as c:
            r = c.get("/health")
            data = r.json()
            click.echo(f"Status: {data['status']}")
            click.echo(f"Servers: {data['servers']}")
            click.echo(f"Groups: {data['groups']}")
    except Exception as e:
        _handle_error(e)


@main.command()
def scan():
    """Re-discover all MCP servers."""
    try:
        with _client() as c:
            r = c.post("/scan")
            data = r.json()
            click.echo(f"Found {data['servers_found']} servers, {data['groups_found']} groups")
            for name in data.get("server_names", []):
                click.echo(f"  {name}")
    except Exception as e:
        _handle_error(e)


@main.command()
@click.option("--dry-run", is_flag=True, help="Preview without writing files")
def deploy(dry_run: bool):
    """Deploy .mcp.json files to repos."""
    try:
        with _client() as c:
            if dry_run:
                r = c.post("/deploy/preview")
                data = r.json()
                click.echo(f"{data['changes']} files would change:")
                for path, info in data.get("files", {}).items():
                    click.echo(f"  [{info['action']}] {path}: {', '.join(info['servers'])}")
            else:
                r = c.post("/deploy")
                data = r.json()
                click.echo(f"Written: {len(data.get('written', []))} files")
                for p in data.get("written", []):
                    click.echo(f"  {p}")
                if data.get("errors"):
                    click.echo(f"Errors: {len(data['errors'])}")
                    for e in data["errors"]:
                        click.echo(f"  {e['path']}: {e['error']}")
                if data.get("removed_from_user"):
                    click.echo(f"Removed from user scope: {', '.join(data['removed_from_user'])}")
    except Exception as e:
        _handle_error(e)


@main.command(name="open")
def open_ui():
    """Open the registry in a browser."""
    webbrowser.open(BASE_URL)
    click.echo(f"Opened {BASE_URL}")


@main.command()
def servers():
    """List all known servers."""
    try:
        with _client() as c:
            r = c.get("/servers")
            data = r.json()
            for name, info in sorted(data.items()):
                health = info.get("health", "unknown")
                scope = info.get("source_scope", "?")
                icon = "✓" if health == "connected" else "✗" if health == "failed" else "?"
                click.echo(f"  {icon} {name} ({info.get('type', '?')}) [{scope}]")
            click.echo(f"\n{len(data)} servers total")
    except Exception as e:
        _handle_error(e)


@main.command()
def groups():
    """List all groups."""
    try:
        with _client() as c:
            r = c.get("/groups")
            data = r.json()
            for key, info in sorted(data.items()):
                path = info.get("path") or "(global)"
                svrs = info.get("servers", [])
                click.echo(f"  {info['label']} [{key}] — {path}")
                for s in svrs:
                    click.echo(f"    • {s}")
            click.echo(f"\n{len(data)} groups total")
    except Exception as e:
        _handle_error(e)


@main.command()
@click.argument("server")
@click.argument("group")
def assign(server: str, group: str):
    """Assign a server to a group."""
    try:
        with _client() as c:
            r = c.post("/assign", json={"server": server, "group": group})
            if r.status_code == 200:
                click.echo(f"Assigned {server} → {group}")
            else:
                click.echo(f"Error: {r.json().get('error', 'unknown')}", err=True)
    except Exception as e:
        _handle_error(e)
