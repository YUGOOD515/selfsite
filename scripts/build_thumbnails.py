"""Create same-name WebP previews from project originals; preserve source images."""

import argparse
from pathlib import Path

from PIL import Image


ASSETS = Path(__file__).resolve().parents[1] / "my-site" / "public" / "assets"


def build_thumbnails(output: Path, only: str | None = None, files: set[str] | None = None) -> None:
    count = 0
    for directory in sorted(ASSETS.iterdir()):
        if not directory.is_dir() or directory.name == "thumbs":
            continue
        if only is not None and directory.name != only:
            continue
        for source in sorted(directory.iterdir()):
            if files is not None and source.name not in files:
                continue
            if source.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
                continue
            target = output / directory.name / source.with_suffix(".webp").name
            target.parent.mkdir(parents=True, exist_ok=True)
            portrait = directory.name == "galgame" and (source.stem.startswith("sp_") or "_立绘_" in source.stem)
            with Image.open(source) as original:
                transparent = "A" in original.getbands() or "transparency" in original.info
                preview = original.convert("RGBA" if transparent else "RGB")
                preview.thumbnail((480, 720) if portrait else (960, 600), Image.Resampling.LANCZOS)
                preview.save(target, "WEBP", quality=90 if directory.name == "galgame" else 92, method=6)
            count += 1
    print(f"Built {count} previews in {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ASSETS / "thumbs")
    parser.add_argument("--directory", choices=sorted(path.name for path in ASSETS.iterdir() if path.is_dir() and path.name != "thumbs"))
    parser.add_argument("--files", nargs="+", metavar="NAME", help="Only generate these original filenames; requires --directory")
    args = parser.parse_args()
    if args.files:
        if not args.directory:
            parser.error("--files requires --directory")
        missing = set(args.files) - {path.name for path in (ASSETS / args.directory).iterdir() if path.is_file()}
        if missing:
            parser.error(f"Unknown originals: {', '.join(sorted(missing))}")
    build_thumbnails(args.output.resolve(), args.directory, set(args.files) if args.files else None)
