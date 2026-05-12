import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from 'docx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const inputPath = path.join(rootDir, 'TECHNICAL_HANDOVER.md');
const outputPath = path.join(rootDir, 'Arvind_Analytics_Technical_Handover.docx');

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' };
const TABLE_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function textRun(text, options = {}) {
  return new TextRun({ text, size: 22, font: 'Aptos', ...options });
}

function para(text, options = {}) {
  return new Paragraph({
    children: [textRun(text)],
    spacing: { before: 80, after: 80 },
    ...options,
  });
}

function heading(level, text) {
  const headingMap = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
  };
  return new Paragraph({
    heading: headingMap[level] || HeadingLevel.HEADING_3,
    children: [textRun(text, { bold: true, size: level === 1 ? 34 : level === 2 ? 28 : 24 })],
    spacing: { before: level === 1 ? 280 : 220, after: 100 },
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    children: [textRun(text)],
    spacing: { before: 40, after: 40 },
  });
}

function codeBlock(lines) {
  return new Paragraph({
    children: [new TextRun({
      text: lines.join('\n'),
      font: 'Consolas',
      size: 18,
    })],
    shading: { fill: 'F5F5F5' },
    border: {
      top: BORDER,
      bottom: BORDER,
      left: BORDER,
      right: BORDER,
    },
    spacing: { before: 100, after: 100 },
  });
}

function tableFromRows(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, rowIdx) => new TableRow({
      children: cells.map(cell => new TableCell({
        borders: TABLE_BORDERS,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({
          children: [textRun(cell.trim(), { bold: rowIdx === 0 })],
        })],
      })),
    })),
  });
}

function parseMarkdown(markdown) {
  const children = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let code = null;
  let table = [];

  const flushCode = () => {
    if (code) {
      children.push(codeBlock(code));
      code = null;
    }
  };

  const flushTable = () => {
    if (table.length) {
      const clean = table.filter(row => !row.every(cell => /^-+$/.test(cell.trim())));
      if (clean.length) children.push(tableFromRows(clean));
      table = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('```')) {
      if (code) flushCode();
      else {
        flushTable();
        code = [];
      }
      continue;
    }

    if (code) {
      code.push(raw);
      continue;
    }

    if (/^\|.*\|$/.test(line)) {
      table.push(line.split('|').slice(1, -1));
      continue;
    }
    flushTable();

    if (!line.trim()) {
      children.push(new Paragraph({ text: '' }));
    } else if (line.startsWith('# ')) {
      children.push(heading(1, line.slice(2).trim()));
    } else if (line.startsWith('## ')) {
      children.push(heading(2, line.slice(3).trim()));
    } else if (line.startsWith('### ')) {
      children.push(heading(3, line.slice(4).trim()));
    } else if (line.startsWith('- ')) {
      children.push(bullet(line.slice(2).trim()));
    } else {
      children.push(para(line.trim()));
    }
  }

  flushCode();
  flushTable();
  return children;
}

const markdown = fs.readFileSync(inputPath, 'utf8');
const doc = new Document({
  creator: 'Codex',
  title: 'Arvind Analytics Technical Handover',
  description: 'Technical handover document for Arvind Analytics',
  sections: [{
    properties: {
      page: {
        margin: { top: 720, bottom: 720, left: 720, right: 720 },
      },
    },
    children: parseMarkdown(markdown),
  }],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputPath, buffer);
console.log(outputPath);
