#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Run the actual patched Toast gesture/animation blocks in Qt, without services."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def braced(source, start):
    opening = source.index('{', start)
    depth = 1
    end = opening + 1
    while depth:
        if source[end] == '{':
            depth += 1
        elif source[end] == '}':
            depth -= 1
        end += 1
    return source[start:end]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('toast', type=Path, help='Actual applied Omarchy 4.5 Toast.qml')
    parser.add_argument('--function', help='Run one Qt test function for regression controls')
    args = parser.parse_args()
    source = args.toast.read_text()
    # Preserve actual production handler, functions and animations verbatim.
    start = source.index('  property real swipeOffset: 0')
    end = source.index('  signal replyRequested()', start)
    block = source[start:end]
    opacity = source[source.index('  opacity: place.hidden ?'):].split('\n\n', 1)[0]
    click_start = source.rindex('    MouseArea {')
    click = braced(source, click_start)
    with tempfile.TemporaryDirectory(prefix='toast-swipe45-') as directory:
        fixture = Path(directory)
        (fixture / 'Style.qml').write_text('''// SPDX-License-Identifier: MIT
pragma Singleton
import QtQuick
QtObject {
    property bool reduceMotion: false
    function space(value) { return value }
    function duration(value) { return reduceMotion ? 0 : value }
}
''')
        (fixture / 'qmldir').write_text('singleton Style 1.0 Style.qml\n')
        (fixture / 'Card.qml').write_text('''// SPDX-License-Identifier: MIT
import QtQuick
Item {
  id: card
  width: 380; height: 130
  property bool replyOpen: false
  property var place: ({ hidden: false, leaving: false })
  property var scene: null
  property var row: ({ key: "fixture" })
  signal dismissed()
  signal activated()
''' + block + opacity + '\n' + click + '''
}
''')
        shutil.copyfile(Path(__file__).with_suffix('.qml'), fixture / 'tst_swipe.qml')
        runtime = fixture / 'runtime'
        runtime.mkdir(mode=0o700)
        env = dict(os.environ, QT_QPA_PLATFORM='offscreen', QT_QUICK_BACKEND='software',
                   QML_DISABLE_DISK_CACHE='1', XDG_RUNTIME_DIR=str(runtime),
                   QT_QPA_PLATFORMTHEME='', NO_AT_BRIDGE='1')
        runner = shutil.which('qmltestrunner') or '/usr/lib/qt6/bin/qmltestrunner'
        command = [runner, '-input', str(fixture), '-import', str(fixture)]
        if args.function:
            command.append('ToastSwipe45::' + args.function)
        result = subprocess.run(command, env=env)
        return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
