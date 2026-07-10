import click


@click.group()
def main():
    pass


@main.command()
def start():
    """Start the FlowBench service."""
    import uvicorn
    uvicorn.run(
        "services.orchestrator.main:app",
        host="127.0.0.1",
        port=8000,
    )


@main.command()
def status():
    """Show current project state."""
    click.echo("Status: not yet implemented")


@main.command()
def help_cmd():
    """Show available commands."""
    click.echo("flowbench start — Start the FlowBench service")
    click.echo("flowbench status — Show current project state")
