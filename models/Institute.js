const mongoose = require('mongoose');

const InstituteSchema = new mongoose.Schema(
  {
    aisheCode: { type: String, index: true },
    name: { type: String, required: true },
    address1: String,
    stateName: { type: String, index: true },
    stateId: mongoose.Schema.Types.Mixed,
    districtName: { type: String, index: true },
    webSite: String,
    manegement: String, // field name as stored upstream
    yearOfEstablishment: mongoose.Schema.Types.Mixed,
    institutionType: String,
    specializedIn: String,
    uploadedYear: mongoose.Schema.Types.Mixed,
    addedYear: mongoose.Schema.Types.Mixed,
    universityId: mongoose.Schema.Types.Mixed,
    universityName: String,
    universityType: String,
    location: String, // Urban / Rural
    course: mongoose.Schema.Types.Mixed,
  },
  { collection: 'heinstitutes' }
);

// Compound index for hub-page listing queries (state -> district -> name)
InstituteSchema.index({ stateName: 1, districtName: 1, name: 1 });

module.exports = mongoose.model('Institute', InstituteSchema);
