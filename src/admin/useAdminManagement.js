import { reactive, ref } from 'vue'
import { adminApi as defaultAdminApi } from './adminApi.js'
import { createTutorAssignmentState } from '../views/adminTutorAssignment.js'

const readCourseTutorIds = (course) => {
  if (Array.isArray(course?.tutors)) {
    return course.tutors.map((tutor) => Number(tutor.id))
  }

  return String(course?.tutor_ids || '')
    .split(',')
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
}

export const useAdminManagement = ({
  adminApi = defaultAdminApi,
  reloadTutors,
  reloadCourses,
  confirmDelete = (message) => window.confirm(message)
}) => {
  const tutors = ref([])
  const courses = ref([])
  const loadingTutors = ref(true)
  const loadingCourses = ref(true)
  const tutorForm = reactive({
    name: '',
    department: '',
    bio: ''
  })
  const courseForm = reactive({
    title: '',
    department: '',
    description: '',
    tutorIds: []
  })
  const tutorSaving = ref(false)
  const courseSaving = ref(false)
  const deletingTutorId = ref(null)
  const deletingCourseId = ref(null)
  const tutorFormError = ref('')
  const courseFormError = ref('')
  const error = ref('')
  const success = ref('')
  const editingTutorId = ref(null)
  const editingCourseId = ref(null)

  const loadTutors = async () => {
    loadingTutors.value = true
    error.value = ''

    try {
      tutors.value = await adminApi.listTutors()
    } catch (err) {
      error.value = 'Tutors are unavailable right now. Please try again shortly.'
    } finally {
      loadingTutors.value = false
    }
  }

  const loadCourses = async () => {
    loadingCourses.value = true
    error.value = ''

    try {
      courses.value = await adminApi.listCourses()
    } catch (err) {
      error.value = 'Courses are unavailable right now. Please try again shortly.'
    } finally {
      loadingCourses.value = false
    }
  }

  const invalidateTutors = reloadTutors || loadTutors
  const invalidateCourses = reloadCourses || loadCourses

  const resetTutorForm = () => {
    editingTutorId.value = null
    tutorForm.name = ''
    tutorForm.department = ''
    tutorForm.bio = ''
    tutorFormError.value = ''
  }

  const resetCourseForm = () => {
    editingCourseId.value = null
    courseForm.title = ''
    courseForm.department = ''
    courseForm.description = ''
    courseForm.tutorIds = []
    courseFormError.value = ''
  }

  const editTutor = (tutor) => {
    editingTutorId.value = tutor.id
    tutorForm.name = tutor.name
    tutorForm.department = tutor.department
    tutorForm.bio = tutor.bio
    success.value = ''
    error.value = ''
    tutorFormError.value = ''
  }

  const editCourse = async (course) => {
    editingCourseId.value = course.id
    courseForm.title = course.title
    courseForm.department = course.department
    courseForm.description = course.description
    courseForm.tutorIds = readCourseTutorIds(course)
    success.value = ''
    error.value = ''
    courseFormError.value = ''

    try {
      const detail = await adminApi.fetchCourse({ courseId: course.id })
      courseForm.tutorIds = readCourseTutorIds(detail || course)

      return true
    } catch (err) {
      courseFormError.value = 'Course details could not be loaded. Assignment data may be out of date.'
      return false
    }
  }

  const saveTutor = async () => {
    error.value = ''
    tutorFormError.value = ''
    success.value = ''

    if (!tutorForm.name.trim() || !tutorForm.department.trim() || !tutorForm.bio.trim()) {
      tutorFormError.value = 'Name, staff affiliation, and bio are required.'
      return false
    }

    tutorSaving.value = true

    try {
      const tutorPayload = {
        name: tutorForm.name,
        department: tutorForm.department,
        bio: tutorForm.bio
      }

      if (editingTutorId.value !== null) {
        await adminApi.updateTutor({
          tutorId: editingTutorId.value,
          ...tutorPayload
        })
      } else {
        await adminApi.createTutor(tutorPayload)
      }

      success.value = editingTutorId.value !== null ? 'Tutor updated.' : 'Tutor created.'
      resetTutorForm()
      await Promise.all([invalidateTutors(), invalidateCourses()])

      return true
    } catch (err) {
      tutorFormError.value = err.message || 'Unable to save tutor.'
      return false
    } finally {
      tutorSaving.value = false
    }
  }

  const saveCourse = async () => {
    error.value = ''
    courseFormError.value = ''
    success.value = ''

    if (!courseForm.title.trim() || !courseForm.department.trim() || !courseForm.description.trim()) {
      courseFormError.value = 'Title, department, and description are required.'
      return false
    }

    courseSaving.value = true

    try {
      const tutorAssignment = createTutorAssignmentState({
        tutors: tutors.value,
        selectedTutorIds: courseForm.tutorIds
      })
      const coursePayload = {
        title: courseForm.title,
        department: courseForm.department,
        description: courseForm.description,
        tutorIds: tutorAssignment.payloadTutorIds
      }

      if (editingCourseId.value !== null) {
        await adminApi.updateCourse({
          courseId: editingCourseId.value,
          ...coursePayload
        })
      } else {
        await adminApi.createCourse(coursePayload)
      }

      success.value = editingCourseId.value !== null ? 'Course updated.' : 'Course created.'
      resetCourseForm()
      await invalidateCourses()

      return true
    } catch (err) {
      courseFormError.value = err.message || 'Unable to save course.'
      return false
    } finally {
      courseSaving.value = false
    }
  }

  const deleteTutor = async (tutor) => {
    if (!confirmDelete(`Delete ${tutor.name}?`)) {
      return false
    }

    error.value = ''
    tutorFormError.value = ''
    success.value = ''
    deletingTutorId.value = tutor.id

    try {
      await adminApi.deleteTutor({ tutorId: tutor.id })

      if (editingTutorId.value === tutor.id) {
        resetTutorForm()
      }

      success.value = 'Tutor deleted.'
      await Promise.all([invalidateTutors(), invalidateCourses()])

      return true
    } catch (err) {
      error.value = err.message || 'Unable to delete tutor.'
      return false
    } finally {
      deletingTutorId.value = null
    }
  }

  const deleteCourse = async (course) => {
    if (!confirmDelete(`Delete ${course.title}?`)) {
      return false
    }

    error.value = ''
    success.value = ''
    deletingCourseId.value = course.id

    try {
      await adminApi.deleteCourse({ courseId: course.id })

      if (editingCourseId.value === course.id) {
        resetCourseForm()
      }

      success.value = 'Course deleted.'
      await invalidateCourses()

      return true
    } catch (err) {
      error.value = err.message || 'Unable to delete course.'
      return false
    } finally {
      deletingCourseId.value = null
    }
  }

  return {
    tutors,
    courses,
    loadingTutors,
    loadingCourses,
    tutorForm,
    courseForm,
    tutorSaving,
    courseSaving,
    deletingTutorId,
    deletingCourseId,
    tutorFormError,
    courseFormError,
    error,
    success,
    editingTutorId,
    editingCourseId,
    editTutor,
    editCourse,
    loadTutors,
    loadCourses,
    resetTutorForm,
    resetCourseForm,
    saveTutor,
    saveCourse,
    deleteTutor,
    deleteCourse
  }
}
