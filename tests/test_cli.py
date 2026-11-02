import argparse
from pathlib import Path

from skku_notice import cli


def test_fixture_dry_run_does_not_write_state(tmp_path: Path, monkeypatch, capsys) -> None:
    state_path = tmp_path / "seen.json"
    monkeypatch.setattr(cli, "STATE_PATH", state_path)
    args = argparse.Namespace(
        rules=Path("config/rules.example.yaml"), dry_run=True, all=True, from_fixtures=True
    )
    assert cli.run(args) == 0
    lines = capsys.readouterr().out.splitlines()
    assert len([line for line in lines if line.startswith("[")]) == 25
    assert sum("state 없음" in line for line in lines) == 2
    assert not state_path.exists()


def test_missing_rules_exits_two(tmp_path: Path, capsys) -> None:
    args = argparse.Namespace(rules=tmp_path / "missing.yaml", dry_run=True, all=False, from_fixtures=True)
    assert cli.run(args) == 2
    assert "config/rules.example.yaml을 복사하세요" in capsys.readouterr().err
