import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath = 'backend/seed_swinburne.js';
const outputPath = 'cloudflare/d1/seed-swinburne.sql';
const source = fs.readFileSync(sourcePath, 'utf8');

const extractConstArray = (name) => {
  const match = source.match(new RegExp(`const ${name} = ([\\s\\S]*?);\\n\\nconst `));

  if (!match) {
    throw new Error(`Could not extract ${name} from ${sourcePath}`);
  }

  return vm.runInNewContext(match[1]);
};

const quoteSql = (value) => `'${String(value).replace(/'/g, "''")}'`;

const tutors = extractConstArray('tutors');
const courses = extractConstArray('courses');
const roundRobinTutorNames = extractConstArray('roundRobinTutorNames');

const lines = [
  '-- Generated from backend/seed_swinburne.js. Do not edit by hand.',
  '-- Regenerate with: npm run d1:seed:swinburne:generate',
  'PRAGMA foreign_keys = ON;'
];

for (const [name, department, bio] of tutors) {
  lines.push(
    `INSERT INTO Tutors (name, department, bio) VALUES (${quoteSql(name)}, ${quoteSql(department)}, ${quoteSql(bio)}) `
    + 'ON CONFLICT(normalized_name, normalized_department) DO UPDATE SET bio = excluded.bio, updated_at = CURRENT_TIMESTAMP;'
  );
}

for (const [title, department, description] of courses) {
  lines.push(
    `INSERT INTO Courses (title, department, description) VALUES (${quoteSql(title)}, ${quoteSql(department)}, ${quoteSql(description)}) `
    + 'ON CONFLICT(normalized_title, normalized_department) DO UPDATE SET description = excluded.description, updated_at = CURRENT_TIMESTAMP;'
  );
}

for (const [index, [courseTitle]] of courses.entries()) {
  const primaryTutorName = roundRobinTutorNames[index % roundRobinTutorNames.length];
  const secondaryTutorName = roundRobinTutorNames[(index + 3) % roundRobinTutorNames.length];

  lines.push(
    'INSERT OR IGNORE INTO Course_Tutors (course_id, tutor_id) '
    + 'SELECT c.id, t.id FROM Courses c, Tutors t '
    + `WHERE c.title = ${quoteSql(courseTitle)} AND t.name = ${quoteSql(primaryTutorName)};`
  );

  if (secondaryTutorName && secondaryTutorName !== primaryTutorName && index % 3 === 0) {
    lines.push(
      'INSERT OR IGNORE INTO Course_Tutors (course_id, tutor_id) '
      + 'SELECT c.id, t.id FROM Courses c, Tutors t '
      + `WHERE c.title = ${quoteSql(courseTitle)} AND t.name = ${quoteSql(secondaryTutorName)};`
    );
  }
}

fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(`Generated ${outputPath} from ${sourcePath}.`);
console.log(`Included ${tutors.length} tutors, ${courses.length} courses, and demo course-to-tutor assignments.`);
