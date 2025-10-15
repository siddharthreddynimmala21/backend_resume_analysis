import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({}, { strict: false, _id: false });

const interviewSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  interviews: [
    {
      sessionId: { type: String, required: true, index: true },
      rounds: [
        {
          round: { type: Number, required: true },
          questions: { type: mongoose.Schema.Types.Mixed, default: {} },
          answers: {
            type: Object,
            default: function () {
              return {
                mcq: {},
                desc: {}
              };
            },
            required: true
          },
          validation: {
            type: Object,
            default: function () {
              return {
                mcq: { score: 0, max_score: 0, details: [] },
                descriptive: { score: 0, max_score: 0, details: [] },
                total_score: 0,
                max_possible_score: 0,
                verdict: "",
                percentage: 0
              };
            },
            required: false
          },
          createdAt: { type: Date, default: Date.now },
          submittedAt: { type: Date, default: null },
          validatedAt: { type: Date, default: null },
        },
      ],
    },
  ],
  resumeInterviews: [
    {
      sessionId: { type: String, required: true, index: true },
      focusArea: { type: String, required: true, enum: ['skills', 'projects', 'work_experience'] },
      // Multi-round support for resume-based interviews
      rounds: [
        {
          round: { type: Number, required: true },
          questions: { type: mongoose.Schema.Types.Mixed, default: {} },
          answers: {
            type: Object,
            default: function () {
              return {
                mcq: {},
                desc: {}
              };
            },
            required: true
          },
          validation: {
            type: Object,
            default: function () {
              return {
                mcq: { score: 0, max_score: 0, details: [] },
                descriptive: { score: 0, max_score: 0, details: [] },
                total_score: 0,
                max_possible_score: 0,
                verdict: "",
                percentage: 0
              };
            },
            required: false
          },
          createdAt: { type: Date, default: Date.now },
          submittedAt: { type: Date, default: null },
          validatedAt: { type: Date, default: null },
        },
      ],
      questions: { type: mongoose.Schema.Types.Mixed, default: {} },
      answers: {
        type: Object,
        default: function () {
          return {
            mcq: {},
            desc: {}
          };
        },
        required: true
      },
      validation: {
        type: Object,
        default: function () {
          return {
            mcq: { score: 0, max_score: 0, details: [] },
            descriptive: { score: 0, max_score: 0, details: [] },
            total_score: 0,
            max_possible_score: 0,
            verdict: "",
            percentage: 0
          };
        },
        required: false
      },
      createdAt: { type: Date, default: Date.now },
      submittedAt: { type: Date, default: null },
      validatedAt: { type: Date, default: null },
    },
  ],
});

export default mongoose.model("InterviewSession", interviewSessionSchema);
