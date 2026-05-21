import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const inputPath = path.join(rootDir, 'README.md');
const outputPath = path.join(rootDir, 'Arvind_Analytics_Complete_Technical_Documentation.docx');

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'D9DEE7' };
const TABLE_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function cleanInline(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function textRun(text, options = {}) {
  return new TextRun({ text, size: 22, font: 'Aptos', ...options });
}

function paragraph(text, options = {}) {
  return new Paragraph({
    children: [textRun(cleanInline(text))],
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
    children: [textRun(cleanInline(text), {
      bold: true,
      size: level === 1 ? 34 : level === 2 ? 28 : 24,
    })],
    spacing: { before: level === 1 ? 260 : 180, after: 100 },
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    children: [textRun(cleanInline(text))],
    spacing: { before: 40, after: 40 },
  });
}

function numbered(text) {
  return paragraph(text);
}

function codeBlock(lines) {
  return new Paragraph({
    children: [new TextRun({
      text: lines.join('\n'),
      font: 'Consolas',
      size: 18,
    })],
    shading: { fill: 'F6F8FA' },
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
    rows: rows.map((cells, rowIndex) => new TableRow({
      children: cells.map((cell) => new TableCell({
        borders: TABLE_BORDERS,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({
          children: [textRun(cleanInline(cell), { bold: rowIndex === 0 })],
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
    if (!table.length) return;
    const cleanRows = table.filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell.trim())));
    if (cleanRows.length) children.push(tableFromRows(cleanRows));
    table = [];
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
      children.push(heading(1, line.slice(2)));
    } else if (line.startsWith('## ')) {
      children.push(heading(2, line.slice(3)));
    } else if (line.startsWith('### ')) {
      children.push(heading(3, line.slice(4)));
    } else if (/^\s+-\s+/.test(line)) {
      const indent = raw.match(/^\s*/)?.[0].length || 0;
      children.push(bullet(line.replace(/^\s+-\s+/, ''), indent >= 2 ? 1 : 0));
    } else if (/^\d+\.\s+/.test(line.trim())) {
      children.push(numbered(line.trim()));
    } else {
      children.push(paragraph(line.trim()));
    }
  }

  flushCode();
  flushTable();
  return children;
}

const markdown = fs.readFileSync(inputPath, 'utf8');
const generatedDate = new Date().toISOString().slice(0, 10);

const doc = new Document({
  creator: 'Codex',
  title: 'Arvind Analytics Complete Technical Documentation',
  description: 'Complete technical documentation generated from the current project README.',
  sections: [{
    properties: {
      page: {
        margin: { top: 720, bottom: 720, left: 720, right: 720 },
      },
    },
    children: [
      heading(1, 'Arvind Analytics - Complete Technical Documentation'),
      paragraph(`Generated on ${generatedDate}`),
      paragraph('Source: Current repository README and implementation state. Secrets and environment-specific credential values are intentionally excluded.'),
      ...parseMarkdown(markdown),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputPath, buffer);
console.log(outputPath);
