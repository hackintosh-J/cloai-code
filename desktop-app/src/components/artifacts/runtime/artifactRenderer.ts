type ProcessedReactArtifact = {
  code: string;
  componentName: string;
};

const HTML_RESET = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif}';
const REACT_ARTIFACT_TYPE = 'application/vnd.ant.react';

const REACT_GLOBALS = [
  'useState',
  'useEffect',
  'useRef',
  'useMemo',
  'useCallback',
  'useReducer',
  'useContext',
  'createContext',
  'Fragment',
  'forwardRef',
  'memo',
  'lazy',
  'Suspense',
].join(', ');

const REACT_BUILTINS = new Set(['React', 'Component', 'PureComponent', 'Fragment', 'Suspense', 'StrictMode']);

export function buildArtifactHtml(content: string, type: string): string {
  if (type === 'text/html') {
    return wrapHtmlArtifact(content);
  }

  const artifact = preprocessReactCode(content);
  return buildReactArtifactDocument(artifact);
}

function wrapHtmlArtifact(content: string): string {
  if (/<html[\s>]/i.test(content)) {
    return content;
  }

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<style>${HTML_RESET}</style>`,
    '</head>',
    `<body>${content}</body>`,
    '</html>',
  ].join('');
}

function buildReactArtifactDocument({ code, componentName }: ProcessedReactArtifact): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin><\/script>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"><\/script>
<script src="https://cdn.tailwindcss.com/3.4.1"><\/script>
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"><\/script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>${HTML_RESET}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const { ${REACT_GLOBALS} } = React;

var _iconCache = {};
window._iconFactory = function(name) {
  if (_iconCache[name]) return _iconCache[name];
  var icon = function LucideIcon(props) {
    props = props || {};
    var iconData = window.lucide && window.lucide.icons && window.lucide.icons[name];
    var children = iconData ? iconData.map(function(el, i) {
      return React.createElement(el[0], Object.assign({ key: i }, el[1]));
    }) : [];
    return React.createElement('svg', {
      width: props.size || 24,
      height: props.size || 24,
      viewBox: '0 0 24 24',
      fill: props.fill || 'none',
      stroke: props.color || 'currentColor',
      strokeWidth: props.strokeWidth || 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: props.className || '',
      style: props.style,
      onClick: props.onClick
    }, children);
  };
  _iconCache[name] = icon;
  return icon;
};

var _chartMock = function(props) {
  return React.createElement('div', {
    style: {
      width: props.width || '100%',
      height: props.height || 300,
      background: '#f5f5f5',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#999',
      fontSize: 14
    }
  }, 'Chart: ' + (props.data ? props.data.length + ' items' : 'no data'));
};
var _passThroughMock = function(props) { return React.createElement(React.Fragment, null, props.children); };
window.ResponsiveContainer = _passThroughMock;
window.LineChart = _chartMock;
window.BarChart = _chartMock;
window.PieChart = _chartMock;
window.AreaChart = _chartMock;
window.Line = function(){return null};
window.Bar = function(){return null};
window.Pie = function(){return null};
window.Area = function(){return null};
window.XAxis = function(){return null};
window.YAxis = function(){return null};
window.CartesianGrid = function(){return null};
window.Tooltip = function(){return null};
window.Legend = function(){return null};
window.Cell = function(){return null};

window.claude = {
  complete: async function() {
    return { content: [{ text: "This artifact requires the Claude API to function. Click 'Customize' to try it in a new conversation." }] };
  }
};

${code}

try {
  const _Component = ${componentName};
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(_Component));
} catch (error) {
  document.getElementById('root').innerHTML = '<div style="padding:24px;color:#e44;font-family:monospace;font-size:13px"><b>Render error:</b><br>' + error.message + '</div>';
  console.error('Artifact render error:', error);
}
<\/script>
</body>
</html>`;
}

function preprocessReactCode(code: string): ProcessedReactArtifact {
  const importedNames: string[] = [];
  const outputLines = stripImportsAndExports(code, importedNames);
  const componentName = findMainComponentName(code, outputLines.componentName);
  const iconPreamble = importedNames
    .filter((name) => /^[A-Z]/.test(name) && !REACT_BUILTINS.has(name))
    .map((name) => `if (typeof ${name} === 'undefined') { var ${name} = window._iconFactory('${name}'); }`)
    .join('\n');

  return {
    componentName,
    code: [iconPreamble, outputLines.lines.join('\n')].filter(Boolean).join('\n'),
  };
}

function stripImportsAndExports(code: string, importedNames: string[]) {
  const lines = code.split('\n');
  const keptLines: string[] = [];
  let importBuffer = '';
  let insideImport = false;
  let componentName = 'App';

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('import ') || insideImport) {
      importBuffer = insideImport ? `${importBuffer} ${trimmed}` : trimmed;
      insideImport = importBuffer.includes('{') && !importBuffer.includes('}');
      if (!insideImport) {
        importedNames.push(...extractNamedImports(importBuffer));
        importBuffer = '';
      }
      continue;
    }

    const defaultIdentifier = trimmed.match(/^export\s+default\s+(\w+)\s*;?\s*$/);
    if (defaultIdentifier) {
      componentName = defaultIdentifier[1];
      continue;
    }

    const defaultDeclaration = trimmed.match(/^export\s+default\s+(function|class)\s+(\w+)/);
    if (defaultDeclaration) {
      componentName = defaultDeclaration[2];
      keptLines.push(line.replace(/export\s+default\s+/, ''));
      continue;
    }

    keptLines.push(trimmed.startsWith('export ') ? line.replace(/export\s+/, '') : line);
  }

  return { lines: keptLines, componentName };
}

function extractNamedImports(importStatement: string): string[] {
  const match = importStatement.match(/\{([^}]+)\}/);
  if (!match) return [];

  return match[1]
    .split(',')
    .map((name) => {
      const [direct, alias] = name.trim().split(/\s+as\s+/);
      return (alias || direct || '').trim();
    })
    .filter(Boolean);
}

function findMainComponentName(originalCode: string, exportedName: string): string {
  if (exportedName !== 'App') return exportedName;

  const candidates = [...originalCode.matchAll(/(?:const|function)\s+([A-Z]\w+)\s*[=(]/g)];
  return candidates.length > 0 ? candidates[candidates.length - 1][1] : 'App';
}

export async function loadArtifactCode(codeFile: string): Promise<{ content: string; type: string; title: string } | null> {
  try {
    const response = await fetch(`./artifact-gallery/code/${codeFile}`);
    if (!response.ok) return null;

    const data = await response.json();
    return {
      content: data.content || '',
      type: data.type || 'text/html',
      title: data.title || '',
    };
  } catch {
    return null;
  }
}
