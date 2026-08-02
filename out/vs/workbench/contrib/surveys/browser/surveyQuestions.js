import { localize } from "../../../../nls.js";
var SurveyQuestionType = /* @__PURE__ */ ((SurveyQuestionType2) => {
  SurveyQuestionType2["Segment"] = "segment";
  SurveyQuestionType2["Radio"] = "radio";
  return SurveyQuestionType2;
})(SurveyQuestionType || {});
const CopilotPMFSurvey = {
  id: "copilot-pmf",
  title: localize("survey.copilotPmf.title", "Help Us Improve GitHub Copilot"),
  description: localize("survey.copilotPmf.description", "This short survey helps us understand how well Copilot fits into your workflow."),
  questions: [
    {
      type: "segment" /* Segment */,
      id: "disappointment",
      required: true,
      telemetryKey: "score",
      asMeasurement: true,
      label: localize("survey.copilotPmf.q1", "How disappointed would you be if you could no longer use Copilot?"),
      options: [
        { id: "not-at-all", label: localize("survey.copilotPmf.q1.notAtAll", "Not at all") },
        { id: "slightly", label: localize("survey.copilotPmf.q1.slightly", "Slightly") },
        { id: "somewhat", label: localize("survey.copilotPmf.q1.somewhat", "Somewhat") },
        { id: "very", label: localize("survey.copilotPmf.q1.very", "Very") },
        { id: "extremely", label: localize("survey.copilotPmf.q1.extremely", "Extremely") }
      ]
    },
    {
      type: "radio" /* Radio */,
      id: "primary-benefit",
      telemetryKey: "primaryBenefit",
      label: localize("survey.copilotPmf.q2", "What has Copilot helped you with most recently?"),
      columns: 2,
      options: [
        { id: "shipping-faster", label: localize("survey.copilotPmf.q2.shippingFaster", "Shipping changes faster") },
        { id: "getting-unstuck", label: localize("survey.copilotPmf.q2.gettingUnstuck", "Getting unstuck on bugs") },
        { id: "multi-file", label: localize("survey.copilotPmf.q2.multiFile", "Making multi-file changes") },
        { id: "automating", label: localize("survey.copilotPmf.q2.automating", "Automating repetitive work") },
        { id: "understanding", label: localize("survey.copilotPmf.q2.understanding", "Understanding the codebase") },
        { id: "planning", label: localize("survey.copilotPmf.q2.planning", "Planning an approach") },
        { id: "reviewing", label: localize("survey.copilotPmf.q2.reviewing", "Improving or reviewing code") },
        { id: "no-clear-value", label: localize("survey.copilotPmf.q2.noClearValue", "I haven't gotten clear value yet") },
        { id: "other", label: localize("survey.copilotPmf.q2.other", "None of the above") }
      ]
    },
    {
      type: "radio" /* Radio */,
      id: "primary-friction",
      telemetryKey: "primaryFriction",
      label: localize("survey.copilotPmf.q3", "What most gets in your way?"),
      columns: 2,
      options: [
        { id: "trust", label: localize("survey.copilotPmf.q3.trust", "Output is hard to trust") },
        { id: "context", label: localize("survey.copilotPmf.q3.context", "Missing repo or project context") },
        { id: "bigger-tasks", label: localize("survey.copilotPmf.q3.biggerTasks", "Struggles with bigger tasks") },
        { id: "reviewing-time", label: localize("survey.copilotPmf.q3.reviewingTime", "Too much time reviewing") },
        { id: "steering", label: localize("survey.copilotPmf.q3.steering", "Too much steering needed") },
        { id: "slow", label: localize("survey.copilotPmf.q3.slow", "Too slow / breaks flow") },
        { id: "setup", label: localize("survey.copilotPmf.q3.setup", "Setup or integrations are hard") },
        { id: "security", label: localize("survey.copilotPmf.q3.security", "Security or permissions friction") },
        { id: "cost", label: localize("survey.copilotPmf.q3.cost", "Limits, cost, or billing") },
        { id: "other", label: localize("survey.copilotPmf.q3.other", "None of the above") }
      ]
    },
    {
      type: "segment" /* Segment */,
      id: "programming-experience",
      telemetryKey: "programmingExperience",
      asMeasurement: true,
      label: localize("survey.copilotPmf.q4", "How long have you been programming?"),
      options: [
        { id: "less-than-3", label: localize("survey.copilotPmf.q4.lessThan3", "<3 yr") },
        { id: "3-to-5", label: localize("survey.copilotPmf.q4.3to5", "3-5 yr") },
        { id: "6-to-9", label: localize("survey.copilotPmf.q4.6to9", "6-9 yr") },
        { id: "10-to-19", label: localize("survey.copilotPmf.q4.10to19", "10-19 yr") },
        { id: "20-plus", label: localize("survey.copilotPmf.q4.20plus", "20+ yr") }
      ]
    }
  ]
};
export {
  CopilotPMFSurvey,
  SurveyQuestionType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3N1cnZleXMvYnJvd3Nlci9zdXJ2ZXlRdWVzdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFN1cnZleVF1ZXN0aW9uVHlwZSB7XG5cdFNlZ21lbnQgPSAnc2VnbWVudCcsXG5cdFJhZGlvID0gJ3JhZGlvJyxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3VydmV5T3B0aW9uIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElTdXJ2ZXlRdWVzdGlvbkJhc2Uge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBvcHRpb25zOiByZWFkb25seSBJU3VydmV5T3B0aW9uW107XG5cdC8qKiBXaGVuIHRydWUsIHRoZSBxdWVzdGlvbiBtdXN0IGJlIGFuc3dlcmVkIGJlZm9yZSBzdWJtaXNzaW9uLiAqL1xuXHRyZWFkb25seSByZXF1aXJlZD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBUaGUgdGVsZW1ldHJ5IGZpZWxkIG5hbWUgdGhpcyBhbnN3ZXIgbWFwcyB0byBpbiB0aGUgYHN1cnZleS9zdWJtaXRgIGV2ZW50LlxuXHQgKiBXaGVuIHNldCwgdGhlIHNlbGVjdGVkIG9wdGlvbiBJRCAob3IgbnVtZXJpYyBpbmRleCBpZiB7QGxpbmsgYXNNZWFzdXJlbWVudH0gaXMgdHJ1ZSkgaXMgZW1pdHRlZCB1bmRlciB0aGlzIGtleS5cblx0ICovXG5cdHJlYWRvbmx5IHRlbGVtZXRyeUtleT86IHN0cmluZztcblx0LyoqIFdoZW4gdHJ1ZSwgdGhlIGFuc3dlciBpcyBsb2dnZWQgYXMgYSBudW1lcmljIGluZGV4IGludG8gdGhlIG9wdGlvbnMgYXJyYXkgKDAtYmFzZWQpIHdpdGggYGlzTWVhc3VyZW1lbnRgLiAqL1xuXHRyZWFkb25seSBhc01lYXN1cmVtZW50PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3VydmV5U2VnbWVudFF1ZXN0aW9uIGV4dGVuZHMgSVN1cnZleVF1ZXN0aW9uQmFzZSB7XG5cdHJlYWRvbmx5IHR5cGU6IFN1cnZleVF1ZXN0aW9uVHlwZS5TZWdtZW50O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdXJ2ZXlSYWRpb1F1ZXN0aW9uIGV4dGVuZHMgSVN1cnZleVF1ZXN0aW9uQmFzZSB7XG5cdHJlYWRvbmx5IHR5cGU6IFN1cnZleVF1ZXN0aW9uVHlwZS5SYWRpbztcblx0cmVhZG9ubHkgY29sdW1ucz86IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgSVN1cnZleVF1ZXN0aW9uID0gSVN1cnZleVNlZ21lbnRRdWVzdGlvbiB8IElTdXJ2ZXlSYWRpb1F1ZXN0aW9uO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTdXJ2ZXlEZWZpbml0aW9uIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcblx0cmVhZG9ubHkgcXVlc3Rpb25zOiByZWFkb25seSBJU3VydmV5UXVlc3Rpb25bXTtcbn1cblxuLyoqXG4gKiBQcm9kdWN0LU1hcmtldCBGaXQgc3VydmV5IGZvciBHaXRIdWIgQ29waWxvdC5cbiAqIEJhc2VkIG9uIHRoZSBTZWFuIEVsbGlzIFwidmVyeSBkaXNhcHBvaW50ZWRcIiB0ZXN0LlxuICovXG5leHBvcnQgY29uc3QgQ29waWxvdFBNRlN1cnZleTogSVN1cnZleURlZmluaXRpb24gPSB7XG5cdGlkOiAnY29waWxvdC1wbWYnLFxuXHR0aXRsZTogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnRpdGxlJywgXCJIZWxwIFVzIEltcHJvdmUgR2l0SHViIENvcGlsb3RcIiksXG5cdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYuZGVzY3JpcHRpb24nLCBcIlRoaXMgc2hvcnQgc3VydmV5IGhlbHBzIHVzIHVuZGVyc3RhbmQgaG93IHdlbGwgQ29waWxvdCBmaXRzIGludG8geW91ciB3b3JrZmxvdy5cIiksXG5cdHF1ZXN0aW9uczogW1xuXHRcdHtcblx0XHRcdHR5cGU6IFN1cnZleVF1ZXN0aW9uVHlwZS5TZWdtZW50LFxuXHRcdFx0aWQ6ICdkaXNhcHBvaW50bWVudCcsXG5cdFx0XHRyZXF1aXJlZDogdHJ1ZSxcblx0XHRcdHRlbGVtZXRyeUtleTogJ3Njb3JlJyxcblx0XHRcdGFzTWVhc3VyZW1lbnQ6IHRydWUsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnExJywgXCJIb3cgZGlzYXBwb2ludGVkIHdvdWxkIHlvdSBiZSBpZiB5b3UgY291bGQgbm8gbG9uZ2VyIHVzZSBDb3BpbG90P1wiKSxcblx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0eyBpZDogJ25vdC1hdC1hbGwnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnExLm5vdEF0QWxsJywgXCJOb3QgYXQgYWxsXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdzbGlnaHRseScsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTEuc2xpZ2h0bHknLCBcIlNsaWdodGx5XCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdzb21ld2hhdCcsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTEuc29tZXdoYXQnLCBcIlNvbWV3aGF0XCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICd2ZXJ5JywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMS52ZXJ5JywgXCJWZXJ5XCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdleHRyZW1lbHknLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnExLmV4dHJlbWVseScsIFwiRXh0cmVtZWx5XCIpIH0sXG5cdFx0XHRdLFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0dHlwZTogU3VydmV5UXVlc3Rpb25UeXBlLlJhZGlvLFxuXHRcdFx0aWQ6ICdwcmltYXJ5LWJlbmVmaXQnLFxuXHRcdFx0dGVsZW1ldHJ5S2V5OiAncHJpbWFyeUJlbmVmaXQnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMicsIFwiV2hhdCBoYXMgQ29waWxvdCBoZWxwZWQgeW91IHdpdGggbW9zdCByZWNlbnRseT9cIiksXG5cdFx0XHRjb2x1bW5zOiAyLFxuXHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHR7IGlkOiAnc2hpcHBpbmctZmFzdGVyJywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMi5zaGlwcGluZ0Zhc3RlcicsIFwiU2hpcHBpbmcgY2hhbmdlcyBmYXN0ZXJcIikgfSxcblx0XHRcdFx0eyBpZDogJ2dldHRpbmctdW5zdHVjaycsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTIuZ2V0dGluZ1Vuc3R1Y2snLCBcIkdldHRpbmcgdW5zdHVjayBvbiBidWdzXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdtdWx0aS1maWxlJywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMi5tdWx0aUZpbGUnLCBcIk1ha2luZyBtdWx0aS1maWxlIGNoYW5nZXNcIikgfSxcblx0XHRcdFx0eyBpZDogJ2F1dG9tYXRpbmcnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnEyLmF1dG9tYXRpbmcnLCBcIkF1dG9tYXRpbmcgcmVwZXRpdGl2ZSB3b3JrXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICd1bmRlcnN0YW5kaW5nJywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMi51bmRlcnN0YW5kaW5nJywgXCJVbmRlcnN0YW5kaW5nIHRoZSBjb2RlYmFzZVwiKSB9LFxuXHRcdFx0XHR7IGlkOiAncGxhbm5pbmcnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnEyLnBsYW5uaW5nJywgXCJQbGFubmluZyBhbiBhcHByb2FjaFwiKSB9LFxuXHRcdFx0XHR7IGlkOiAncmV2aWV3aW5nJywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMi5yZXZpZXdpbmcnLCBcIkltcHJvdmluZyBvciByZXZpZXdpbmcgY29kZVwiKSB9LFxuXHRcdFx0XHR7IGlkOiAnbm8tY2xlYXItdmFsdWUnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnEyLm5vQ2xlYXJWYWx1ZScsIFwiSSBoYXZlbid0IGdvdHRlbiBjbGVhciB2YWx1ZSB5ZXRcIikgfSxcblx0XHRcdFx0eyBpZDogJ290aGVyJywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMi5vdGhlcicsIFwiTm9uZSBvZiB0aGUgYWJvdmVcIikgfSxcblx0XHRcdF0sXG5cdFx0fSxcblx0XHR7XG5cdFx0XHR0eXBlOiBTdXJ2ZXlRdWVzdGlvblR5cGUuUmFkaW8sXG5cdFx0XHRpZDogJ3ByaW1hcnktZnJpY3Rpb24nLFxuXHRcdFx0dGVsZW1ldHJ5S2V5OiAncHJpbWFyeUZyaWN0aW9uJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTMnLCBcIldoYXQgbW9zdCBnZXRzIGluIHlvdXIgd2F5P1wiKSxcblx0XHRcdGNvbHVtbnM6IDIsXG5cdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdHsgaWQ6ICd0cnVzdCcsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTMudHJ1c3QnLCBcIk91dHB1dCBpcyBoYXJkIHRvIHRydXN0XCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdjb250ZXh0JywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMy5jb250ZXh0JywgXCJNaXNzaW5nIHJlcG8gb3IgcHJvamVjdCBjb250ZXh0XCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdiaWdnZXItdGFza3MnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnEzLmJpZ2dlclRhc2tzJywgXCJTdHJ1Z2dsZXMgd2l0aCBiaWdnZXIgdGFza3NcIikgfSxcblx0XHRcdFx0eyBpZDogJ3Jldmlld2luZy10aW1lJywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMy5yZXZpZXdpbmdUaW1lJywgXCJUb28gbXVjaCB0aW1lIHJldmlld2luZ1wiKSB9LFxuXHRcdFx0XHR7IGlkOiAnc3RlZXJpbmcnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnEzLnN0ZWVyaW5nJywgXCJUb28gbXVjaCBzdGVlcmluZyBuZWVkZWRcIikgfSxcblx0XHRcdFx0eyBpZDogJ3Nsb3cnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnEzLnNsb3cnLCBcIlRvbyBzbG93IC8gYnJlYWtzIGZsb3dcIikgfSxcblx0XHRcdFx0eyBpZDogJ3NldHVwJywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMy5zZXR1cCcsIFwiU2V0dXAgb3IgaW50ZWdyYXRpb25zIGFyZSBoYXJkXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdzZWN1cml0eScsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTMuc2VjdXJpdHknLCBcIlNlY3VyaXR5IG9yIHBlcm1pc3Npb25zIGZyaWN0aW9uXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICdjb3N0JywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMy5jb3N0JywgXCJMaW1pdHMsIGNvc3QsIG9yIGJpbGxpbmdcIikgfSxcblx0XHRcdFx0eyBpZDogJ290aGVyJywgbGFiZWw6IGxvY2FsaXplKCdzdXJ2ZXkuY29waWxvdFBtZi5xMy5vdGhlcicsIFwiTm9uZSBvZiB0aGUgYWJvdmVcIikgfSxcblx0XHRcdF0sXG5cdFx0fSxcblx0XHR7XG5cdFx0XHR0eXBlOiBTdXJ2ZXlRdWVzdGlvblR5cGUuU2VnbWVudCxcblx0XHRcdGlkOiAncHJvZ3JhbW1pbmctZXhwZXJpZW5jZScsXG5cdFx0XHR0ZWxlbWV0cnlLZXk6ICdwcm9ncmFtbWluZ0V4cGVyaWVuY2UnLFxuXHRcdFx0YXNNZWFzdXJlbWVudDogdHJ1ZSxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTQnLCBcIkhvdyBsb25nIGhhdmUgeW91IGJlZW4gcHJvZ3JhbW1pbmc/XCIpLFxuXHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHR7IGlkOiAnbGVzcy10aGFuLTMnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnE0Lmxlc3NUaGFuMycsIFwiPDMgeXJcIikgfSxcblx0XHRcdFx0eyBpZDogJzMtdG8tNScsIGxhYmVsOiBsb2NhbGl6ZSgnc3VydmV5LmNvcGlsb3RQbWYucTQuM3RvNScsIFwiMy01IHlyXCIpIH0sXG5cdFx0XHRcdHsgaWQ6ICc2LXRvLTknLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnE0LjZ0bzknLCBcIjYtOSB5clwiKSB9LFxuXHRcdFx0XHR7IGlkOiAnMTAtdG8tMTknLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnE0LjEwdG8xOScsIFwiMTAtMTkgeXJcIikgfSxcblx0XHRcdFx0eyBpZDogJzIwLXBsdXMnLCBsYWJlbDogbG9jYWxpemUoJ3N1cnZleS5jb3BpbG90UG1mLnE0LjIwcGx1cycsIFwiMjArIHlyXCIpIH0sXG5cdFx0XHRdLFxuXHRcdH0sXG5cdF0sXG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFFbEIsSUFBVyxxQkFBWCxrQkFBV0Esd0JBQVg7QUFDTixFQUFBQSxvQkFBQSxhQUFVO0FBQ1YsRUFBQUEsb0JBQUEsV0FBUTtBQUZTLFNBQUFBO0FBQUEsR0FBQTtBQStDWCxNQUFNLG1CQUFzQztBQUFBLEVBQ2xELElBQUk7QUFBQSxFQUNKLE9BQU8sU0FBUywyQkFBMkIsZ0NBQWdDO0FBQUEsRUFDM0UsYUFBYSxTQUFTLGlDQUFpQyxpRkFBaUY7QUFBQSxFQUN4SSxXQUFXO0FBQUEsSUFDVjtBQUFBLE1BQ0MsTUFBTTtBQUFBLE1BQ04sSUFBSTtBQUFBLE1BQ0osVUFBVTtBQUFBLE1BQ1YsY0FBYztBQUFBLE1BQ2QsZUFBZTtBQUFBLE1BQ2YsT0FBTyxTQUFTLHdCQUF3QixtRUFBbUU7QUFBQSxNQUMzRyxTQUFTO0FBQUEsUUFDUixFQUFFLElBQUksY0FBYyxPQUFPLFNBQVMsaUNBQWlDLFlBQVksRUFBRTtBQUFBLFFBQ25GLEVBQUUsSUFBSSxZQUFZLE9BQU8sU0FBUyxpQ0FBaUMsVUFBVSxFQUFFO0FBQUEsUUFDL0UsRUFBRSxJQUFJLFlBQVksT0FBTyxTQUFTLGlDQUFpQyxVQUFVLEVBQUU7QUFBQSxRQUMvRSxFQUFFLElBQUksUUFBUSxPQUFPLFNBQVMsNkJBQTZCLE1BQU0sRUFBRTtBQUFBLFFBQ25FLEVBQUUsSUFBSSxhQUFhLE9BQU8sU0FBUyxrQ0FBa0MsV0FBVyxFQUFFO0FBQUEsTUFD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
