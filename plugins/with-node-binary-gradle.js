const { withAppBuildGradle, withProjectBuildGradle, withSettingsGradle } = require('@expo/config-plugins')

const SETTINGS_NODE_MARKER_START = '  // @generated begin with-node-binary-gradle settings-node-command'
const SETTINGS_NODE_MARKER_END = '  // @generated end with-node-binary-gradle settings-node-command'

const APP_NODE_MARKER_START = '// @generated begin with-node-binary-gradle app-node-executable'
const APP_NODE_MARKER_END = '// @generated end with-node-binary-gradle app-node-executable'

const SETTINGS_NODE_COMMAND_BLOCK = [
  SETTINGS_NODE_MARKER_START,
  '  def nodeCommand = System.getenv("NODE_BINARY")',
  '  if (nodeCommand != null && !nodeCommand.trim().isEmpty() && !new File(nodeCommand).canExecute()) {',
  '    nodeCommand = null',
  '  }',
  '  if (nodeCommand == null || nodeCommand.trim().isEmpty()) {',
  '    def homebrewNode = new File("/opt/homebrew/bin/node")',
  '    def localNode = new File("/usr/local/bin/node")',
  '    if (homebrewNode.canExecute()) {',
  '      nodeCommand = homebrewNode.absolutePath',
  '    } else if (localNode.canExecute()) {',
  '      nodeCommand = localNode.absolutePath',
  '    } else {',
  '      nodeCommand = "node"',
  '    }',
  '  }',
  SETTINGS_NODE_MARKER_END,
].join('\n')

const APP_NODE_EXECUTABLE_BLOCK = [
  APP_NODE_MARKER_START,
  'def nodeExecutable = System.getenv("NODE_BINARY")',
  'if (nodeExecutable != null && !nodeExecutable.trim().isEmpty() && !new File(nodeExecutable).canExecute()) {',
  '    nodeExecutable = null',
  '}',
  'if (nodeExecutable == null || nodeExecutable.trim().isEmpty()) {',
  '    def homebrewNode = new File("/opt/homebrew/bin/node")',
  '    def localNode = new File("/usr/local/bin/node")',
  '    if (homebrewNode.canExecute()) {',
  '        nodeExecutable = homebrewNode.absolutePath',
  '    } else if (localNode.canExecute()) {',
  '        nodeExecutable = localNode.absolutePath',
  '    } else {',
  '        nodeExecutable = "node"',
  '    }',
  '}',
  APP_NODE_MARKER_END,
].join('\n')

function replaceBetweenMarkers(contents, markerStart, markerEnd, replacement) {
  const pattern = new RegExp(`${escapeForRegex(markerStart)}[\\s\\S]*?${escapeForRegex(markerEnd)}`, 'm')
  if (!pattern.test(contents)) {
    return null
  }
  return contents.replace(pattern, replacement)
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function ensureSettingsNodeCommandBlock(contents) {
  let updated = contents

  const markerReplaced = replaceBetweenMarkers(
    updated,
    SETTINGS_NODE_MARKER_START,
    SETTINGS_NODE_MARKER_END,
    SETTINGS_NODE_COMMAND_BLOCK,
  )
  if (markerReplaced != null) {
    updated = markerReplaced
  } else if (/def nodeCommand\s*=/.test(updated) && /def reactNativeGradlePlugin\s*=\s*new File\(/.test(updated)) {
    updated = updated.replace(
      /\s*def nodeCommand\s*=([\s\S]*?)(?=\n\s*def reactNativeGradlePlugin\s*=\s*new File\()/m,
      `\n${SETTINGS_NODE_COMMAND_BLOCK}\n`,
    )
  } else {
    updated = updated.replace(/pluginManagement\s*\{\n/, (match) => `${match}${SETTINGS_NODE_COMMAND_BLOCK}\n\n`)
  }

  updated = updated.replace(
    /commandLine\((?:nodeCommand|"node"),\s*"--print",\s*"require\.resolve\('@react-native\/gradle-plugin\/package\.json', \{ paths: \[require\.resolve\('react-native\/package\.json'\)\] \}\)"\)/g,
    'commandLine(nodeCommand, "--print", "require.resolve(\'@react-native/gradle-plugin/package.json\', { paths: [require.resolve(\'react-native/package.json\')] })")',
  )

  updated = updated.replace(
    /commandLine\((?:nodeCommand|"node"),\s*"--print",\s*"require\.resolve\('expo-modules-autolinking\/package\.json', \{ paths: \[require\.resolve\('expo\/package\.json'\)\] \}\)"\)/g,
    'commandLine(nodeCommand, "--print", "require.resolve(\'expo-modules-autolinking/package.json\', { paths: [require.resolve(\'expo/package.json\')] })")',
  )

  updated = updated.replace(
    /(  \/\/ @generated end with-node-binary-gradle settings-node-command\n)(?:\s*\n)+(\s*def reactNativeGradlePlugin\s*=\s*new File\()/m,
    '$1\n$2',
  )

  return updated
}

function ensureAppNodeExecutableBlock(contents) {
  let updated = contents

  const markerReplaced = replaceBetweenMarkers(
    updated,
    APP_NODE_MARKER_START,
    APP_NODE_MARKER_END,
    APP_NODE_EXECUTABLE_BLOCK,
  )
  if (markerReplaced != null) {
    updated = markerReplaced
  } else if (
    /def nodeExecutable\s*=/.test(updated) &&
    /\/\*\*\n \* This is the configuration block to customize your React Native Android app\./m.test(updated)
  ) {
    updated = updated.replace(
      /def nodeExecutable\s*=([\s\S]*?)(?=\n\/\*\*\n \* This is the configuration block to customize your React Native Android app\.)/m,
      `${APP_NODE_EXECUTABLE_BLOCK}\n\n`,
    )
  } else {
    updated = updated.replace(
      /(def projectRoot\s*=\s*rootDir\.getAbsoluteFile\(\)\.getParentFile\(\)\.getAbsolutePath\(\)\n)/,
      `$1${APP_NODE_EXECUTABLE_BLOCK}\n\n`,
    )
  }

  updated = updated.replace(/\["node",/g, '[nodeExecutable,')

  const reactBlockMatch = updated.match(/react\s*\{[\s\S]*?\n\}/m)
  if (reactBlockMatch) {
    const reactBlock = reactBlockMatch[0]
    let normalizedBlock

    if (/^\s*nodeExecutableAndArgs\s*=.*$/m.test(reactBlock)) {
      normalizedBlock = reactBlock.replace(
        /^\s*nodeExecutableAndArgs\s*=.*$/m,
        '    nodeExecutableAndArgs = [nodeExecutable]',
      )
    } else {
      normalizedBlock = reactBlock.replace(/react\s*\{\n/, 'react {\n    nodeExecutableAndArgs = [nodeExecutable]\n')
    }

    updated = updated.replace(reactBlock, normalizedBlock)
  }

  return updated
}

function normalizeProjectJitpackUrl(contents) {
  let updated = contents

  updated = updated.replace(
    /(^[ \t]*)maven\s*\{\s*url(?:\s*=|\s+)\s*['"]https:\/\/www\.jitpack\.io['"]\s*\}/gm,
    '$1maven { url = "https://www.jitpack.io" }',
  )

  updated = updated.replace(
    /(^[ \t]*)maven\s*\{\s*\n(?:[ \t]*\/\/[^\n]*\n)*[ \t]*url(?:\s*=|\s+)\s*['"]https:\/\/www\.jitpack\.io['"]\s*\n[ \t]*\}/gm,
    '$1maven { url = "https://www.jitpack.io" }',
  )

  return updated
}

const withNodeBinaryGradle = (config) => {
  config = withSettingsGradle(config, (configWithSettingsGradle) => {
    if (configWithSettingsGradle.modResults.language !== 'groovy') {
      return configWithSettingsGradle
    }

    configWithSettingsGradle.modResults.contents = ensureSettingsNodeCommandBlock(
      configWithSettingsGradle.modResults.contents,
    )

    return configWithSettingsGradle
  })

  config = withAppBuildGradle(config, (configWithAppBuildGradle) => {
    if (configWithAppBuildGradle.modResults.language !== 'groovy') {
      return configWithAppBuildGradle
    }

    configWithAppBuildGradle.modResults.contents = ensureAppNodeExecutableBlock(
      configWithAppBuildGradle.modResults.contents,
    )

    return configWithAppBuildGradle
  })

  config = withProjectBuildGradle(config, (configWithProjectBuildGradle) => {
    if (configWithProjectBuildGradle.modResults.language !== 'groovy') {
      return configWithProjectBuildGradle
    }

    configWithProjectBuildGradle.modResults.contents = normalizeProjectJitpackUrl(
      configWithProjectBuildGradle.modResults.contents,
    )

    return configWithProjectBuildGradle
  })

  return config
}

module.exports = withNodeBinaryGradle
