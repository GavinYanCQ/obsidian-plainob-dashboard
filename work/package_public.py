"""Build a public release using only explicitly listed repository files.

Never read an installed vault, saved plugin settings, profiles or backups.
The source archive can rebuild and package itself on Windows and macOS.
"""
from pathlib import Path
import hashlib
import json
import re
import zipfile

BASE = Path(__file__).resolve().parents[1]
PLUGIN = BASE / 'work' / 'workbench'
PUBLIC = BASE / 'work' / 'public-release'
RUNTIME = ('main.js', 'styles.css', 'manifest.json')
SOURCES = (
    'main.js', 'config.js', 'translations.json', 'i18n.js', 'model.js',
    'search.js', 'hover.js', 'routing.js', 'resources.js', 'setup.js',
    'setup-ui.js', 'manifest.json', 'styles.css', 'README.md',
    'model.test.js', 'search.test.js', 'hover.test.js', 'order.test.js',
    'config.test.js', 'setup.test.js', 'integration.test.js', 'release.test.js', 'versions.json',
)
DOCS = (
    'README.md', 'README.zh-CN.md', 'README.zh-TW.md', 'README.ja.md', 'README.ko.md',
    'CHANGELOG.md', 'LICENSE', 'CONTRIBUTING.md',
    '.gitignore', '.github/workflows/check.yml', 'docs/INSTALL.en.md',
    'docs/INSTALL.zh-CN.md', 'docs/PRIVACY.md', 'docs/RELEASE-CHECKLIST.md', 'docs/RELEASE-1.4.1.md',
)
SCRIPTS = (
    'work/build_workbench.py', 'work/package_public.py', 'work/prepare_demo.cjs',
    'work/translation-keys.json', 'work/setup-translation-keys.json',
)
IMAGE_ASSETS = ('docs/images/home-zh.png', 'docs/images/bookshelf-zh.png',
                'docs/images/project-steps-zh.png', 'docs/images/search-demo-zh.gif',
                'docs/images/task-demo-zh.gif', 'docs/images/home-en.png',
                'docs/images/bookshelf-en.png', 'docs/images/project-steps-en.png',
                'docs/images/search-demo-en.gif', 'docs/images/task-demo-en.gif',
                'docs/images/kofi-support.png', 'docs/images/wechat-pay.png')
# Legacy IDs are retained intentionally for compatibility; author credit is public.
FORBIDDEN_PATHS = re.compile(r'(?:\b[A-Za-z]:[\\/]|/Users/|/home/)', re.I)
SECRET_MARKERS = ('sk-ant-api', '-----BEGIN PRIVATE KEY-----')


def validate_entries(entries):
    for name, content in entries.items():
        path = Path(name)
        if path.is_absolute() or '..' in path.parts or '\\' in name:
            raise ValueError(f'Unsafe archive name: {name}')
        if any(p in ('data.json', '.claudian', 'setup-backups', 'sync-backups') for p in path.parts):
            raise ValueError(f'Private release member: {name}')
        if name.endswith('-validation.js') or path.name == 'validation.js':
            raise ValueError(f'Historical validation script: {name}')
        asset_name = name.removeprefix('work/public-release/')
        if asset_name in IMAGE_ASSETS:
            assert content.startswith(b'\x89PNG\r\n\x1a\n') if name.endswith('.png') else content.startswith(b'GIF8')
            assert len(content) < 10_000_000
            continue
        text = content.decode('utf-8')
        # The checker contains its own prohibited examples; do not scan itself.
        if name != 'work/package_public.py':
            # Tests deliberately contain invalid absolute-path examples.
            if ((not name.endswith('.test.js') and FORBIDDEN_PATHS.search(text))
                    or any(value in text for value in SECRET_MARKERS)):
                raise ValueError(f'Personal content or machine path in {name}')


def file_bytes(path):
    return path.read_bytes()


def write_zip(path, entries):
    validate_entries(entries)
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr(name, data)
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(entries)


def main():
    manifest = json.loads((PLUGIN / 'manifest.json').read_text(encoding='utf-8'))
    version = manifest['version']
    assert manifest['id'] == 'plainob'
    assert manifest['author'] == 'GavinCQ'
    assert manifest['isDesktopOnly'] is True
    assert re.fullmatch(r'\d+\.\d+\.\d+', version)
    runtime = {name: file_bytes(PLUGIN / ('dist/main.js' if name == 'main.js' else name)) for name in RUNTIME}
    docs = {name: file_bytes(PUBLIC / name) for name in (*DOCS, *IMAGE_ASSETS)}
    history = json.loads((PLUGIN / 'versions.json').read_text(encoding='utf-8'))
    assert isinstance(history, dict) and history
    assert all(re.fullmatch(r'\d+\.\d+\.\d+', key) and
               isinstance(value, str) and re.fullmatch(r'\d+\.\d+\.\d+', value)
               for key, value in history.items())
    assert history.get(version) == manifest['minAppVersion'], 'Update versions.json alongside the manifest; keep earlier releases.'
    versions = (json.dumps(history, indent=2) + '\n').encode()
    source = dict(runtime, **docs)
    source['versions.json'] = versions
    source.update({'work/workbench/' + name: file_bytes(PLUGIN / name) for name in SOURCES})
    source.update({name: file_bytes(BASE / name) for name in SCRIPTS})
    # Include documentation sources so an extracted repository can package again.
    source.update({'work/public-release/' + name: data for name, data in docs.items()})
    installer = {'plainob/' + name: data for name, data in runtime.items()}
    installer.update(docs)
    validate_entries(source)
    validate_entries(installer)
    out = BASE / 'outputs' / f'PlainOB-{version}-public'
    out.mkdir(parents=True, exist_ok=True)
    for name, data in {**runtime, 'versions.json': versions}.items():
        (out / name).write_bytes(data)
    for suffix, entries in [('installer', installer), ('source', source)]:
        write_zip(out / f'PlainOB-{version}-{suffix}.zip', entries)
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
              for p in sorted(out.iterdir()) if p.is_file() and p.name != 'SHA256SUMS.txt'}
    (out / 'SHA256SUMS.txt').write_text(''.join(f'{value}  {name}\n' for name, value in hashes.items()), encoding='utf-8', newline='\n')
    print(json.dumps({'version': version, 'directory': str(out),
                      'installerFiles': len(installer), 'sourceFiles': len(source),
                      'savedSettingsIncluded': False, 'personalVaultRead': False}, ensure_ascii=False))


if __name__ == '__main__':
    main()
