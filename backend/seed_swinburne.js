import pool from './db.js';

const SOURCES = {
  computingTechnologies: 'https://www.swinburne.edu.au/about/our-structure/organisational-structure/schools-departments/school-science-computing-engineering-technologies/department-computing-technologies/',
  computerScienceHandbook: 'https://www.swinburne.edu.au/course/undergraduate/bachelor-of-computer-science/handbook/'
};

const tutors = [
  ['Associate Professor Caslon Chua', 'Computing Technologies', 'Department Chair, Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Abhik Banerjee', 'Computing Technologies', 'Senior Research Fellow in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Siva Chandrasekaran', 'Computing Technologies', 'Senior Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Professor Jinjun Chen', 'Computing Technologies', 'Professor in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Lu Chen', 'Computing Technologies', 'ARC DECRA Fellow in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Professor Tsong Chen', 'Computing Technologies', 'Professor, Software Engineering. Public staff record sourced from Swinburne.'],
  ['Dr Afzal Azeem Chowdhary', 'Computing Technologies', 'Education Specialist in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Tan Ngoc Dinh (Chris)', 'Computing Technologies', 'Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Abdur Forkan', 'Computing Technologies', 'Senior Research Fellow in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Professor Dimitrios Georgakopoulos', 'Computing Technologies', 'Director, ARC Industrial Transformation Research Hub for Future Digital Manufacturing. Public staff record sourced from Swinburne.'],
  ['Professor Jun Han', 'Computing Technologies', 'Professor, Software Engineering. Public staff record sourced from Swinburne.'],
  ['Dr Qiang He', 'Computing Technologies', 'Professor in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Professor Prem Prakash Jayaraman', 'Computing Technologies', 'Director, Factory of the Future and Digital Innovation Lab. Public staff record sourced from Swinburne.'],
  ['Dr Tanjila Kanij', 'Computing Technologies', 'Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Ati Kia', 'Computing Technologies', 'Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Tuan Dung Lai', 'Computing Technologies', 'Education Specialist in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Wei Lai', 'Computing Technologies', 'Senior Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Man Lau', 'Computing Technologies', 'Deputy Chair, Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Professor Chee Peng (CP) Lim', 'Computing Technologies', 'Professor, Computational Intelligence. Public staff record sourced from Swinburne.'],
  ['Professor Chengfei Liu', 'Computing Technologies', 'Professor in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Huai Liu', 'Computing Technologies', 'Senior Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Markus Lumpe', 'Computing Technologies', 'Senior Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Wanlun Ma', 'Computing Technologies', 'Postdoctoral Research Fellow in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Felip Marti', 'Computing Technologies', 'Senior Research Fellow in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Associate Professor Chris McCarthy', 'Computing Technologies', 'Associate Professor in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Matthew Mitchell', 'Computing Technologies', 'Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Associate Professor Andreea Molnar', 'Computing Technologies', 'Associate Professor in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Associate Professor Irene Moser', 'Computing Technologies', 'Associate Professor in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Kaberi Naznin', 'Computing Technologies', 'Education Specialist in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ["Andrew O'Connor", 'Computing Technologies', 'Education Specialist in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Eureka Priyadarshani', 'Computing Technologies', 'Education Specialist in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Professor Kai Qin', 'Computing Technologies', 'Director, Intelligent Data Analytics Lab. Public staff record sourced from Swinburne.'],
  ['Dr Dana Rezazadegan', 'Computing Technologies', 'Senior Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Nicole Ronald', 'Computing Technologies', 'Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Pei-Wei Tsai', 'Computing Technologies', 'Senior Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Associate Professor Bao Quoc Vo', 'Computing Technologies', 'Associate Professor in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Viet Vo', 'Computing Technologies', 'Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Karola von Baggo', 'Computing Technologies', 'Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Sheng Wen', 'Computing Technologies', 'Director, Blockchain Innovation Lab. Public staff record sourced from Swinburne.'],
  ['Professor Yun Yang', 'Computing Technologies', 'Professor in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Associate Professor Ali Yavari', 'Computing Technologies', 'Director, 6G Research and Innovation Laboratory. Public staff record sourced from Swinburne.'],
  ['Dr Bita Zaferanloo', 'Computing Technologies', 'Senior Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Armita Zarnegar', 'Computing Technologies', 'Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Dr Hao Zhang', 'Computing Technologies', 'Education Specialist in the Department of Computing Technologies. Public staff record sourced from Swinburne.'],
  ['Professor Jun Zhang', 'Computing Technologies', 'Director, Cybersecurity Lab. Public staff record sourced from Swinburne.'],
  ['Dr Rui Zhou', 'Computing Technologies', 'Senior Lecturer in the Department of Computing Technologies. Public staff record sourced from Swinburne.']
];

const courses = [
  ['COS10004 Computer Systems', 'Computer Science', 'Core Bachelor of Computer Science unit listed in the Swinburne course handbook.'],
  ['COS10009 Introduction to Programming', 'Computer Science', 'Core Bachelor of Computer Science unit listed in the Swinburne course handbook.'],
  ['COS10026 Web Technology Project', 'Computer Science', 'Core Bachelor of Computer Science unit listed in the Swinburne course handbook.'],
  ['COS10025 Technology in an Indigenous Context Project', 'Computer Science', 'Core Bachelor of Computer Science unit listed in the Swinburne course handbook.'],
  ['COS20007 Object Oriented Programming', 'Computer Science', 'Core Bachelor of Computer Science unit listed in the Swinburne course handbook.'],
  ['TNE10006 Networks and Switching', 'Computer Science', 'Core Bachelor of Computer Science unit listed in the Swinburne course handbook.'],
  ['COS40005 Computing Technology Project A', 'Computer Science', 'Core Bachelor of Computer Science unit listed in the Swinburne course handbook.'],
  ['COS40006 Computing Technology Project B', 'Computer Science', 'Core Bachelor of Computer Science unit listed in the Swinburne course handbook.'],
  ['COS20019 Cloud Computing Architecture', 'Computer Science', 'Major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS20031 Database Design Project', 'Computer Science', 'Major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS30019 Introduction to Artificial Intelligence', 'Artificial Intelligence', 'Artificial Intelligence major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS30018 Intelligent Systems', 'Artificial Intelligence', 'Artificial Intelligence major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS30082 Applied Machine Learning', 'Artificial Intelligence', 'Artificial Intelligence major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS40007 Artificial Intelligence Engineering', 'Artificial Intelligence', 'Artificial Intelligence major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS20030 Malware Analysis', 'Cybersecurity', 'Cybersecurity major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['TNE20003 Internet and Cybersecurity for Engineering Applications', 'Cybersecurity', 'Cybersecurity major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['TNE30009 Network Security and Resilience', 'Cybersecurity', 'Cybersecurity major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS30015 IT Security', 'Cybersecurity', 'Cybersecurity major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS10022 Data Science Principles', 'Data Science', 'Data Science major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS20028 Big Data Architecture and Application', 'Data Science', 'Data Science major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS30045 Data Visualisation', 'Data Science', 'Data Science major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['SWE40006 Software Deployment and Evolution', 'Software Engineering', 'Data Science and Games Development major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['DDD20022 3D Modelling for Objects and Environments', 'Games Development', 'Games Development major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS30002 Artificial Intelligence for Games', 'Games Development', 'Games Development major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS30017 Software Development for Mobile Devices', 'Software Development', 'Games Development and Internet of Things major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS30031 Games Programming', 'Games Development', 'Games Development major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['TNE10005 Network Administration', 'Internet of Things', 'Internet of Things major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['SWE30011 IoT Programming', 'Internet of Things', 'Internet of Things major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS30020 Advanced Web Development', 'Internet of Things', 'Internet of Things major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS30008 Data Structures and Patterns', 'Software Development', 'Software Development major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['SWE30009 Software Testing and Reliability', 'Software Engineering', 'Software Development major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['COS30049 Computing Technology Innovation Project', 'Computer Science', 'Major unit listed across Swinburne Bachelor of Computer Science majors.'],
  ['COS30043 Interface Design and Development', 'Software Development', 'Software Development major unit listed in the Swinburne Bachelor of Computer Science handbook.'],
  ['SWE30003 Software Architectures and Design', 'Software Engineering', 'Major unit listed across Swinburne Bachelor of Computer Science majors.'],
  ['COS40003 Concurrent Programming', 'Software Development', 'Software Development major unit listed in the Swinburne Bachelor of Computer Science handbook.']
];

const roundRobinTutorNames = [
  'Associate Professor Caslon Chua',
  'Professor Jun Han',
  'Professor Chee Peng (CP) Lim',
  'Professor Jun Zhang',
  'Professor Kai Qin',
  'Dr Tanjila Kanij',
  'Dr Markus Lumpe',
  'Dr Matthew Mitchell',
  'Associate Professor Andreea Molnar',
  'Dr Pei-Wei Tsai',
  'Dr Sheng Wen',
  'Associate Professor Ali Yavari'
];

const upsertTutor = async (conn, [name, department, bio]) => {
  await conn.query(
    `
      INSERT INTO Tutors (name, department, bio)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        bio = VALUES(bio),
        updated_at = CURRENT_TIMESTAMP
    `,
    [name, department, bio]
  );
};

const upsertCourse = async (conn, [title, department, description]) => {
  await conn.query(
    `
      INSERT INTO Courses (title, department, description)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        description = VALUES(description),
        updated_at = CURRENT_TIMESTAMP
    `,
    [title, department, description]
  );
};

const loadIdMap = async (conn, table, labelColumn) => {
  const rows = await conn.query(`SELECT id, ${labelColumn} AS label FROM ${table}`);
  return new Map(rows.map((row) => [row.label, Number(row.id)]));
};

const seedRelationships = async (conn) => {
  const tutorIds = await loadIdMap(conn, 'Tutors', 'name');
  const courseIds = await loadIdMap(conn, 'Courses', 'title');

  for (const [index, [courseTitle]] of courses.entries()) {
    const courseId = courseIds.get(courseTitle);
    const primaryTutorId = tutorIds.get(roundRobinTutorNames[index % roundRobinTutorNames.length]);
    const secondaryTutorId = tutorIds.get(roundRobinTutorNames[(index + 3) % roundRobinTutorNames.length]);

    if (!courseId || !primaryTutorId) {
      continue;
    }

    await conn.query(
      'INSERT IGNORE INTO Course_Tutors (course_id, tutor_id) VALUES (?, ?)',
      [courseId, primaryTutorId]
    );

    if (secondaryTutorId && secondaryTutorId !== primaryTutorId && index % 3 === 0) {
      await conn.query(
        'INSERT IGNORE INTO Course_Tutors (course_id, tutor_id) VALUES (?, ?)',
        [courseId, secondaryTutorId]
      );
    }
  }
};

const seed = async () => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    for (const tutor of tutors) {
      await upsertTutor(conn, tutor);
    }

    for (const course of courses) {
      await upsertCourse(conn, course);
    }

    await seedRelationships(conn);
    await conn.commit();

    console.log(`Seeded ${tutors.length} Swinburne public staff records as tutors.`);
    console.log(`Seeded ${courses.length} Swinburne Bachelor of Computer Science units as courses.`);
    console.log('Course-to-tutor links are demo assignments for this app; verify unit convenors before using as official teaching assignments.');
    console.log('Sources:');
    console.log(`- ${SOURCES.computingTechnologies}`);
    console.log(`- ${SOURCES.computerScienceHandbook}`);
  } catch (err) {
    if (conn) {
      await conn.rollback();
    }
    console.error('Error seeding Swinburne data:', err);
    process.exitCode = 1;
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
};

seed();
