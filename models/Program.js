const mongoose = require('mongoose');

const ProgramSchema = new mongoose.Schema(
  {
    category: String,
    aisheCode: { type: String, index: true },
    institute_name: String,
    state: String,
    stateCode: String,
    district: String,
    districtCode: String,
    facultyName: String,
    departmentName: String,
    level: String,
    levelId: String,
    programme: String,
    programmeId: String,
    discipline: String,
    disciplineGroup: String,
    broad_disciplineGroupId: String,
    disciplineGroupCategory: String,
    broad_disciplineGroupCategoryId: String,
    mode: String,
    modeId: String,
    whetherVocationalCourse: String,
    yearOfStart: String,
    intake: String,
    durationYear: String,
    durationMonth: String,
    courseType: String,
    courseTypeId: String,
    system: String,
    supernumerary: mongoose.Schema.Types.Mixed,
    courseStatus: String,
    courseStatusId: String,
  },
  { collection: 'heprograms' }
);

module.exports = mongoose.model('Program', ProgramSchema);
