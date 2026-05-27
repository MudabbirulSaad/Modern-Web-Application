import { jest } from '@jest/globals'
import { useAdminManagement } from './useAdminManagement.js'

const createWorkflow = (overrides = {}) => {
  const adminApi = {
    createTutor: jest.fn(async () => ({ id: 1 })),
    updateTutor: jest.fn(async () => ({ id: 1 })),
    deleteTutor: jest.fn(async () => null),
    createCourse: jest.fn(async () => ({ id: 2 })),
    updateCourse: jest.fn(async () => ({ id: 2 })),
    deleteCourse: jest.fn(async () => null),
    fetchCourse: jest.fn(async () => ({ id: 2, tutor_ids: '1,3' })),
    listUsers: jest.fn(async () => [
      {
        id: 1,
        username: 'primaryadmin',
        email: 'primary@example.edu',
        role: 'admin',
        is_primary_admin: true,
        is_current_user: false
      }
    ]),
    ...overrides.adminApi
  }
  const reloadTutors = jest.fn(async () => null)
  const reloadCourses = jest.fn(async () => null)

  return {
    adminApi,
    reloadTutors,
    reloadCourses,
    workflow: useAdminManagement({
      adminApi,
      reloadTutors,
      reloadCourses,
      ...overrides.options
    })
  }
}

describe('admin management workflow', () => {
  it('loads the read-only user role directory for the Users tab', async () => {
    const { adminApi, workflow } = createWorkflow()

    await workflow.loadUsers()

    expect(adminApi.listUsers).toHaveBeenCalledTimes(1)
    expect(workflow.users.value).toEqual([
      {
        id: 1,
        username: 'primaryadmin',
        email: 'primary@example.edu',
        role: 'admin',
        is_primary_admin: true,
        is_current_user: false
      }
    ])
    expect(workflow.loadingUsers.value).toBe(false)
    expect(workflow.userLoadError.value).toBe('')
  })

  it('reports user directory load failures without losing the Users tab state', async () => {
    const { workflow } = createWorkflow({
      adminApi: {
        listUsers: jest.fn(async () => {
          throw new Error('Forbidden')
        })
      }
    })

    await workflow.loadUsers()

    expect(workflow.users.value).toEqual([])
    expect(workflow.loadingUsers.value).toBe(false)
    expect(workflow.userLoadError.value).toBe('Users are unavailable right now. Please try again shortly.')
  })

  it('saves a new tutor, resets the form, and reloads tutors and courses', async () => {
    const { adminApi, reloadTutors, reloadCourses, workflow } = createWorkflow()

    workflow.tutorForm.name = 'Ada Lovelace'
    workflow.tutorForm.department = 'Computer Science'
    workflow.tutorForm.bio = 'Teaches algorithms.'

    const saved = await workflow.saveTutor()

    expect(saved).toBe(true)
    expect(adminApi.createTutor).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      department: 'Computer Science',
      bio: 'Teaches algorithms.'
    })
    expect(reloadTutors).toHaveBeenCalledTimes(1)
    expect(reloadCourses).toHaveBeenCalledTimes(1)
    expect(workflow.success.value).toBe('Tutor created.')
    expect(workflow.tutorForm).toEqual({
      name: '',
      department: '',
      bio: ''
    })
    expect(workflow.tutorSaving.value).toBe(false)
  })

  it('saves a new course, resets the form, and reloads courses only', async () => {
    const { adminApi, reloadTutors, reloadCourses, workflow } = createWorkflow()

    workflow.courseForm.title = 'COS10005 Web Development'
    workflow.courseForm.department = 'Computer Science'
    workflow.courseForm.description = 'Builds modern web applications.'
    workflow.courseForm.tutorIds = [1, 3]

    const saved = await workflow.saveCourse()

    expect(saved).toBe(true)
    expect(adminApi.createCourse).toHaveBeenCalledWith({
      title: 'COS10005 Web Development',
      department: 'Computer Science',
      description: 'Builds modern web applications.',
      tutorIds: [1, 3]
    })
    expect(reloadCourses).toHaveBeenCalledTimes(1)
    expect(reloadTutors).not.toHaveBeenCalled()
    expect(workflow.success.value).toBe('Course created.')
    expect(workflow.courseForm).toEqual({
      title: '',
      department: '',
      description: '',
      tutorIds: []
    })
    expect(workflow.courseSaving.value).toBe(false)
  })

  it('normalizes course tutor assignments before saving a course', async () => {
    const { adminApi, workflow } = createWorkflow()

    workflow.tutors.value = [
      { id: 1, name: 'Dr Maya Chen', department: 'Computer Science' },
      { id: 2, name: 'Prof Liam Patel', department: 'Information Systems' }
    ]
    workflow.courseForm.title = 'COS10005 Web Development'
    workflow.courseForm.department = 'Computer Science'
    workflow.courseForm.description = 'Builds modern web applications.'
    workflow.courseForm.tutorIds = [1, '2', 2, 999, 'invalid', 0]

    const saved = await workflow.saveCourse()

    expect(saved).toBe(true)
    expect(adminApi.createCourse).toHaveBeenCalledWith({
      title: 'COS10005 Web Development',
      department: 'Computer Science',
      description: 'Builds modern web applications.',
      tutorIds: [1, 2]
    })
  })

  it('deletes a tutor, clears matching edit state, and reloads tutors and courses', async () => {
    const { adminApi, reloadTutors, reloadCourses, workflow } = createWorkflow({
      options: {
        confirmDelete: jest.fn(() => true)
      }
    })
    const tutor = {
      id: 7,
      name: 'Grace Hopper',
      department: 'Software Engineering',
      bio: 'Compiler specialist.'
    }

    workflow.editTutor(tutor)

    const deleted = await workflow.deleteTutor(tutor)

    expect(deleted).toBe(true)
    expect(adminApi.deleteTutor).toHaveBeenCalledWith({ tutorId: 7 })
    expect(workflow.editingTutorId.value).toBe(null)
    expect(workflow.tutorForm.name).toBe('')
    expect(workflow.success.value).toBe('Tutor deleted.')
    expect(reloadTutors).toHaveBeenCalledTimes(1)
    expect(reloadCourses).toHaveBeenCalledTimes(1)
    expect(workflow.deletingTutorId.value).toBe(null)
  })

  it('updates an edited tutor through the same save workflow', async () => {
    const { adminApi, reloadTutors, reloadCourses, workflow } = createWorkflow()

    workflow.editTutor({
      id: 8,
      name: 'Old name',
      department: 'Computing',
      bio: 'Old bio.'
    })
    workflow.tutorForm.name = 'Updated Tutor'
    workflow.tutorForm.bio = 'Updated bio.'

    const saved = await workflow.saveTutor()

    expect(saved).toBe(true)
    expect(adminApi.updateTutor).toHaveBeenCalledWith({
      tutorId: 8,
      name: 'Updated Tutor',
      department: 'Computing',
      bio: 'Updated bio.'
    })
    expect(adminApi.createTutor).not.toHaveBeenCalled()
    expect(workflow.success.value).toBe('Tutor updated.')
    expect(workflow.editingTutorId.value).toBe(null)
    expect(reloadTutors).toHaveBeenCalledTimes(1)
    expect(reloadCourses).toHaveBeenCalledTimes(1)
  })

  it('loads course details for editing and updates the course with assigned tutors', async () => {
    const { adminApi, reloadTutors, reloadCourses, workflow } = createWorkflow()

    const loaded = await workflow.editCourse({
      id: 12,
      title: 'Original Course',
      department: 'Information Systems',
      description: 'Original description.',
      tutor_ids: '4'
    })
    workflow.courseForm.description = 'Updated description.'
    workflow.courseForm.tutorIds = [1, 3, 5]

    const saved = await workflow.saveCourse()

    expect(loaded).toBe(true)
    expect(adminApi.fetchCourse).toHaveBeenCalledWith({ courseId: 12 })
    expect(adminApi.updateCourse).toHaveBeenCalledWith({
      courseId: 12,
      title: 'Original Course',
      department: 'Information Systems',
      description: 'Updated description.',
      tutorIds: [1, 3, 5]
    })
    expect(adminApi.createCourse).not.toHaveBeenCalled()
    expect(workflow.success.value).toBe('Course updated.')
    expect(workflow.editingCourseId.value).toBe(null)
    expect(reloadCourses).toHaveBeenCalledTimes(1)
    expect(reloadTutors).not.toHaveBeenCalled()
  })

  it('reports course detail load failures while keeping fallback edit values visible', async () => {
    const { workflow } = createWorkflow({
      adminApi: {
        fetchCourse: jest.fn(async () => {
          throw new Error('Detail endpoint failed')
        })
      }
    })

    const loaded = await workflow.editCourse({
      id: 22,
      title: 'Fallback Course',
      department: 'Design',
      description: 'Fallback description.',
      tutor_ids: '2,4'
    })

    expect(loaded).toBe(false)
    expect(workflow.editingCourseId.value).toBe(22)
    expect(workflow.courseForm.tutorIds).toEqual([2, 4])
    expect(workflow.courseFormError.value).toBe('Course details could not be loaded. Assignment data may be out of date.')
  })

  it('rejects invalid tutor and course forms before calling the API', async () => {
    const { adminApi, reloadTutors, reloadCourses, workflow } = createWorkflow()

    workflow.tutorForm.name = 'Ada Lovelace'
    workflow.tutorForm.department = 'Computer Science'
    workflow.courseForm.title = 'COS10005 Web Development'
    workflow.courseForm.description = 'Builds modern web applications.'

    const tutorSaved = await workflow.saveTutor()
    const courseSaved = await workflow.saveCourse()

    expect(tutorSaved).toBe(false)
    expect(courseSaved).toBe(false)
    expect(workflow.tutorFormError.value).toBe('Name, staff affiliation, and bio are required.')
    expect(workflow.courseFormError.value).toBe('Title, department, and description are required.')
    expect(adminApi.createTutor).not.toHaveBeenCalled()
    expect(adminApi.createCourse).not.toHaveBeenCalled()
    expect(reloadTutors).not.toHaveBeenCalled()
    expect(reloadCourses).not.toHaveBeenCalled()
  })

  it('deletes a course, clears matching edit state, and reloads courses only', async () => {
    const { adminApi, reloadTutors, reloadCourses, workflow } = createWorkflow({
      options: {
        confirmDelete: jest.fn(() => true)
      }
    })
    const course = {
      id: 13,
      title: 'Deleted Course',
      department: 'Computing',
      description: 'Soon gone.',
      tutor_ids: '1'
    }

    await workflow.editCourse(course)

    const deleted = await workflow.deleteCourse(course)

    expect(deleted).toBe(true)
    expect(adminApi.deleteCourse).toHaveBeenCalledWith({ courseId: 13 })
    expect(workflow.editingCourseId.value).toBe(null)
    expect(workflow.courseForm.title).toBe('')
    expect(workflow.success.value).toBe('Course deleted.')
    expect(reloadCourses).toHaveBeenCalledTimes(1)
    expect(reloadTutors).not.toHaveBeenCalled()
    expect(workflow.deletingCourseId.value).toBe(null)
  })
})
