"""Console logging only: logs never leave the machine and hold no credentials."""

import logging


def setup_logging(environment: str = "development") -> None:
    level = logging.DEBUG if environment.lower() in {"dev", "development", "test"} else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
        force=True,
    )
