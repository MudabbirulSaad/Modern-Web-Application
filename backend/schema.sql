CREATE TABLE IF NOT EXISTS Tutors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  department VARCHAR(255) NOT NULL,
  bio TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO Tutors (id, name, department, bio)
VALUES
  (1, 'Dr Maya Chen', 'Computer Science', 'Specialises in web development, interface design, and human-computer interaction.'),
  (2, 'Prof Liam Patel', 'Information Systems', 'Teaches database design, enterprise systems, and data-driven application development.'),
  (3, 'Dr Amelia Wright', 'Software Engineering', 'Focuses on agile delivery, software architecture, and project-based learning.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  department = VALUES(department),
  bio = VALUES(bio);
