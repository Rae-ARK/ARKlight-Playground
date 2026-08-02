import { escape } from "../../../../base/common/strings.js";
import { localize } from "../../../../nls.js";
const sendSystemInfoLabel = escape(localize("sendSystemInfo", "Include my system information"));
const sendProcessInfoLabel = escape(localize("sendProcessInfo", "Include my currently running processes"));
const sendWorkspaceInfoLabel = escape(localize("sendWorkspaceInfo", "Include my workspace metadata"));
const sendExtensionsLabel = escape(localize("sendExtensions", "Include my enabled extensions"));
const sendExperimentsLabel = escape(localize("sendExperiments", "Include A/B experiment info"));
const sendExtensionData = escape(localize("sendExtensionData", "Include additional extension info"));
const acknowledgementsLabel = escape(localize("acknowledgements", "I acknowledge that my VS Code version is not updated and this issue may be closed."));
const reviewGuidanceLabel = localize(
  // intentionally not escaped because of its embedded tags
  {
    key: "reviewGuidanceLabel",
    comment: [
      '{Locked="<a href="https://github.com/microsoft/vscode/wiki/Submitting-Bugs-and-Suggestions" target="_blank">"}',
      '{Locked="</a>"}'
    ]
  },
  'Before you report an issue here please <a href="https://github.com/microsoft/vscode/wiki/Submitting-Bugs-and-Suggestions" target="_blank">review the guidance we provide</a>. Please complete the form in English.'
);
var issueReporterPage_default = () => `
<div id="update-banner" class="issue-reporter-update-banner hidden">
	<span class="update-banner-text" id="update-banner-text">
		<!-- To be dynamically filled -->
	</span>
</div>
<div class="issue-reporter" id="issue-reporter">
	<div id="english" class="input-group hidden">${escape(localize("completeInEnglish", "Please complete the form in English."))}</div>

	<div id="review-guidance-help-text" class="input-group">${reviewGuidanceLabel}</div>

	<div class="section">
		<div class="input-group">
			<label class="inline-label" for="issue-type">${escape(localize("issueTypeLabel", "This is a"))}</label>
			<select id="issue-type" class="inline-form-control">
				<!-- To be dynamically filled -->
			</select>
		</div>

		<div class="input-group" id="problem-source">
			<label class="inline-label" for="issue-source">${escape(localize("issueSourceLabel", "For"))} <span class="required-input">*</span></label>
			<select id="issue-source" class="inline-form-control" required>
				<!-- To be dynamically filled -->
			</select>
			<div id="issue-source-empty-error" class="validation-error hidden" role="alert">${escape(localize("issueSourceEmptyValidation", "An issue source is required."))}</div>
			<div id="problem-source-help-text" class="instructions hidden">${escape(localize("disableExtensionsLabelText", "Try to reproduce the problem after {0}. If the problem only reproduces when extensions are active, it is likely an issue with an extension.")).replace("{0}", () => `<span tabIndex=0 role="button" id="disableExtensions" class="workbenchCommand">${escape(localize("disableExtensions", "disabling all extensions and reloading the window"))}</span>`)}
			</div>

			<div id="extension-selection">
				<label class="inline-label" for="extension-selector">${escape(localize("chooseExtension", "Extension"))} <span class="required-input">*</span></label>
				<select id="extension-selector" class="inline-form-control">
					<!-- To be dynamically filled -->
				</select>
				<div id="extension-selection-validation-error" class="validation-error hidden" role="alert">${escape(localize("extensionWithNonstandardBugsUrl", "The issue reporter is unable to create issues for this extension. Please visit {0} to report an issue.")).replace("{0}", () => `<span tabIndex=0 role="button" id="extensionBugsLink" class="workbenchCommand"><!-- To be dynamically filled --></span>`)}</div>
				<div id="extension-selection-validation-error-no-url" class="validation-error hidden" role="alert">
					${escape(localize("extensionWithNoBugsUrl", "The issue reporter is unable to create issues for this extension, as it does not specify a URL for reporting issues. Please check the marketplace page of this extension to see if other instructions are available."))}
				</div>
			</div>
		</div>

		<div id="issue-title-container" class="input-group">
			<label class="inline-label" for="issue-title">${escape(localize("issueTitleLabel", "Title"))} <span class="required-input">*</span></label>
			<input id="issue-title" type="text" class="inline-form-control" placeholder="${escape(localize("issueTitleRequired", "Please enter a title."))}" required>
			<div id="issue-title-empty-error" class="validation-error hidden" role="alert">${escape(localize("titleEmptyValidation", "A title is required."))}</div>
			<div id="issue-title-length-validation-error" class="validation-error hidden" role="alert">${escape(localize("titleLengthValidation", "The title is too long."))}</div>
			<small id="similar-issues">
				<!-- To be dynamically filled -->
			</small>
		</div>

	</div>

	<div class="input-group description-section">
		<label for="description" id="issue-description-label">
			<!-- To be dynamically filled -->
		</label>
		<div class="instructions" id="issue-description-subtitle">
			<!-- To be dynamically filled -->
		</div>
		<div class="block-info-text">
			<textarea name="description" id="description" placeholder="${escape(localize("details", "Please enter details."))}" required></textarea>
		</div>
		<div id="description-empty-error" class="validation-error hidden" role="alert">${escape(localize("descriptionEmptyValidation", "A description is required."))}</div>
		<div id="description-short-error" class="validation-error hidden" role="alert">${escape(localize("descriptionTooShortValidation", "Please provide a longer description."))}</div>
	</div>

	<div class="system-info" id="block-container">
		<div class="block block-extension-data">
			<input class="send-extension-data" aria-label="${sendExtensionData}" type="checkbox" id="includeExtensionData" checked/>
			<label class="extension-caption" id="extension-caption" for="includeExtensionData">
				${sendExtensionData}
				<span id="ext-loading" hidden></span>
				<span class="ext-parens" hidden>(</span><a href="#" class="showInfo" id="extension-id">${escape(localize("show", "show"))}</a><span class="ext-parens" hidden>)</span>
				<a id="extension-data-download">${escape(localize("downloadExtensionData", "Download Extension Data"))}</a>
			</label>
			<pre class="block-info" id="extension-data" placeholder="${escape(localize("extensionData", "Extension does not have additional data to include."))}" style="white-space: pre-wrap; user-select: text;">
				<!-- To be dynamically filled -->
			</pre>
		</div>

		<div class="block block-system">
			<input class="sendData" aria-label="${sendSystemInfoLabel}" type="checkbox" id="includeSystemInfo" checked/>
			<label class="caption" for="includeSystemInfo">
				${sendSystemInfoLabel}
				(<a href="#" class="showInfo">${escape(localize("show", "show"))}</a>)
			</label>
			<div class="block-info hidden" style="user-select: text;">
				<!-- To be dynamically filled -->
		</div>
		</div>
		<div class="block block-process">
			<input class="sendData" aria-label="${sendProcessInfoLabel}" type="checkbox" id="includeProcessInfo" checked/>
			<label class="caption" for="includeProcessInfo">
				${sendProcessInfoLabel}
				(<a href="#" class="showInfo">${escape(localize("show", "show"))}</a>)
			</label>
			<pre class="block-info hidden" style="user-select: text;">
				<code>
				<!-- To be dynamically filled -->
				</code>
			</pre>
		</div>
		<div class="block block-workspace">
			<input class="sendData" aria-label="${sendWorkspaceInfoLabel}" type="checkbox" id="includeWorkspaceInfo" checked/>
			<label class="caption" for="includeWorkspaceInfo">
				${sendWorkspaceInfoLabel}
				(<a href="#" class="showInfo">${escape(localize("show", "show"))}</a>)
			</label>
			<pre id="systemInfo" class="block-info hidden" style="user-select: text;">
				<code>
				<!-- To be dynamically filled -->
				</code>
			</pre>
		</div>
		<div class="block block-extensions">
			<input class="sendData" aria-label="${sendExtensionsLabel}" type="checkbox" id="includeExtensions" checked/>
			<label class="caption" for="includeExtensions">
				${sendExtensionsLabel}
				(<a href="#" class="showInfo">${escape(localize("show", "show"))}</a>)
			</label>
			<div id="systemInfo" class="block-info hidden" style="user-select: text;">
				<!-- To be dynamically filled -->
			</div>
		</div>
		<div class="block block-experiments">
			<input class="sendData" aria-label="${sendExperimentsLabel}" type="checkbox" id="includeExperiments" checked/>
			<label class="caption" for="includeExperiments">
				${sendExperimentsLabel}
				(<a href="#" class="showInfo">${escape(localize("show", "show"))}</a>)
			</label>
			<pre class="block-info hidden" style="user-select: text;">
				<!-- To be dynamically filled -->
			</pre>
		</div>
		<div class="block block-acknowledgements hidden" id="version-acknowledgements">
			<input class="sendData" aria-label="${acknowledgementsLabel}" type="checkbox" id="includeAcknowledgement"/>
			<label class="caption" for="includeAcknowledgement">
				${acknowledgementsLabel}
			</label>
		</div>
	</div>

</div>`;
export {
  issueReporterPage_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lzc3VlL2Jyb3dzZXIvaXNzdWVSZXBvcnRlclBhZ2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlc2NhcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuY29uc3Qgc2VuZFN5c3RlbUluZm9MYWJlbCA9IGVzY2FwZShsb2NhbGl6ZSgnc2VuZFN5c3RlbUluZm8nLCBcIkluY2x1ZGUgbXkgc3lzdGVtIGluZm9ybWF0aW9uXCIpKTtcbmNvbnN0IHNlbmRQcm9jZXNzSW5mb0xhYmVsID0gZXNjYXBlKGxvY2FsaXplKCdzZW5kUHJvY2Vzc0luZm8nLCBcIkluY2x1ZGUgbXkgY3VycmVudGx5IHJ1bm5pbmcgcHJvY2Vzc2VzXCIpKTtcbmNvbnN0IHNlbmRXb3Jrc3BhY2VJbmZvTGFiZWwgPSBlc2NhcGUobG9jYWxpemUoJ3NlbmRXb3Jrc3BhY2VJbmZvJywgXCJJbmNsdWRlIG15IHdvcmtzcGFjZSBtZXRhZGF0YVwiKSk7XG5jb25zdCBzZW5kRXh0ZW5zaW9uc0xhYmVsID0gZXNjYXBlKGxvY2FsaXplKCdzZW5kRXh0ZW5zaW9ucycsIFwiSW5jbHVkZSBteSBlbmFibGVkIGV4dGVuc2lvbnNcIikpO1xuY29uc3Qgc2VuZEV4cGVyaW1lbnRzTGFiZWwgPSBlc2NhcGUobG9jYWxpemUoJ3NlbmRFeHBlcmltZW50cycsIFwiSW5jbHVkZSBBL0IgZXhwZXJpbWVudCBpbmZvXCIpKTtcbmNvbnN0IHNlbmRFeHRlbnNpb25EYXRhID0gZXNjYXBlKGxvY2FsaXplKCdzZW5kRXh0ZW5zaW9uRGF0YScsIFwiSW5jbHVkZSBhZGRpdGlvbmFsIGV4dGVuc2lvbiBpbmZvXCIpKTtcbmNvbnN0IGFja25vd2xlZGdlbWVudHNMYWJlbCA9IGVzY2FwZShsb2NhbGl6ZSgnYWNrbm93bGVkZ2VtZW50cycsIFwiSSBhY2tub3dsZWRnZSB0aGF0IG15IFZTIENvZGUgdmVyc2lvbiBpcyBub3QgdXBkYXRlZCBhbmQgdGhpcyBpc3N1ZSBtYXkgYmUgY2xvc2VkLlwiKSk7XG5jb25zdCByZXZpZXdHdWlkYW5jZUxhYmVsID0gbG9jYWxpemUoIC8vIGludGVudGlvbmFsbHkgbm90IGVzY2FwZWQgYmVjYXVzZSBvZiBpdHMgZW1iZWRkZWQgdGFnc1xuXHR7XG5cdFx0a2V5OiAncmV2aWV3R3VpZGFuY2VMYWJlbCcsXG5cdFx0Y29tbWVudDogW1xuXHRcdFx0J3tMb2NrZWQ9XCI8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS93aWtpL1N1Ym1pdHRpbmctQnVncy1hbmQtU3VnZ2VzdGlvbnNcXFwiIHRhcmdldD1cXFwiX2JsYW5rXFxcIj5cIn0nLFxuXHRcdFx0J3tMb2NrZWQ9XCI8L2E+XCJ9J1xuXHRcdF1cblx0fSxcblx0J0JlZm9yZSB5b3UgcmVwb3J0IGFuIGlzc3VlIGhlcmUgcGxlYXNlIDxhIGhyZWY9XCJodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS93aWtpL1N1Ym1pdHRpbmctQnVncy1hbmQtU3VnZ2VzdGlvbnNcIiB0YXJnZXQ9XCJfYmxhbmtcIj5yZXZpZXcgdGhlIGd1aWRhbmNlIHdlIHByb3ZpZGU8L2E+LiBQbGVhc2UgY29tcGxldGUgdGhlIGZvcm0gaW4gRW5nbGlzaC4nXG4pO1xuXG5leHBvcnQgZGVmYXVsdCAoKTogc3RyaW5nID0+IGBcbjxkaXYgaWQ9XCJ1cGRhdGUtYmFubmVyXCIgY2xhc3M9XCJpc3N1ZS1yZXBvcnRlci11cGRhdGUtYmFubmVyIGhpZGRlblwiPlxuXHQ8c3BhbiBjbGFzcz1cInVwZGF0ZS1iYW5uZXItdGV4dFwiIGlkPVwidXBkYXRlLWJhbm5lci10ZXh0XCI+XG5cdFx0PCEtLSBUbyBiZSBkeW5hbWljYWxseSBmaWxsZWQgLS0+XG5cdDwvc3Bhbj5cbjwvZGl2PlxuPGRpdiBjbGFzcz1cImlzc3VlLXJlcG9ydGVyXCIgaWQ9XCJpc3N1ZS1yZXBvcnRlclwiPlxuXHQ8ZGl2IGlkPVwiZW5nbGlzaFwiIGNsYXNzPVwiaW5wdXQtZ3JvdXAgaGlkZGVuXCI+JHtlc2NhcGUobG9jYWxpemUoJ2NvbXBsZXRlSW5FbmdsaXNoJywgXCJQbGVhc2UgY29tcGxldGUgdGhlIGZvcm0gaW4gRW5nbGlzaC5cIikpfTwvZGl2PlxuXG5cdDxkaXYgaWQ9XCJyZXZpZXctZ3VpZGFuY2UtaGVscC10ZXh0XCIgY2xhc3M9XCJpbnB1dC1ncm91cFwiPiR7cmV2aWV3R3VpZGFuY2VMYWJlbH08L2Rpdj5cblxuXHQ8ZGl2IGNsYXNzPVwic2VjdGlvblwiPlxuXHRcdDxkaXYgY2xhc3M9XCJpbnB1dC1ncm91cFwiPlxuXHRcdFx0PGxhYmVsIGNsYXNzPVwiaW5saW5lLWxhYmVsXCIgZm9yPVwiaXNzdWUtdHlwZVwiPiR7ZXNjYXBlKGxvY2FsaXplKCdpc3N1ZVR5cGVMYWJlbCcsIFwiVGhpcyBpcyBhXCIpKX08L2xhYmVsPlxuXHRcdFx0PHNlbGVjdCBpZD1cImlzc3VlLXR5cGVcIiBjbGFzcz1cImlubGluZS1mb3JtLWNvbnRyb2xcIj5cblx0XHRcdFx0PCEtLSBUbyBiZSBkeW5hbWljYWxseSBmaWxsZWQgLS0+XG5cdFx0XHQ8L3NlbGVjdD5cblx0XHQ8L2Rpdj5cblxuXHRcdDxkaXYgY2xhc3M9XCJpbnB1dC1ncm91cFwiIGlkPVwicHJvYmxlbS1zb3VyY2VcIj5cblx0XHRcdDxsYWJlbCBjbGFzcz1cImlubGluZS1sYWJlbFwiIGZvcj1cImlzc3VlLXNvdXJjZVwiPiR7ZXNjYXBlKGxvY2FsaXplKCdpc3N1ZVNvdXJjZUxhYmVsJywgXCJGb3JcIikpfSA8c3BhbiBjbGFzcz1cInJlcXVpcmVkLWlucHV0XCI+Kjwvc3Bhbj48L2xhYmVsPlxuXHRcdFx0PHNlbGVjdCBpZD1cImlzc3VlLXNvdXJjZVwiIGNsYXNzPVwiaW5saW5lLWZvcm0tY29udHJvbFwiIHJlcXVpcmVkPlxuXHRcdFx0XHQ8IS0tIFRvIGJlIGR5bmFtaWNhbGx5IGZpbGxlZCAtLT5cblx0XHRcdDwvc2VsZWN0PlxuXHRcdFx0PGRpdiBpZD1cImlzc3VlLXNvdXJjZS1lbXB0eS1lcnJvclwiIGNsYXNzPVwidmFsaWRhdGlvbi1lcnJvciBoaWRkZW5cIiByb2xlPVwiYWxlcnRcIj4ke2VzY2FwZShsb2NhbGl6ZSgnaXNzdWVTb3VyY2VFbXB0eVZhbGlkYXRpb24nLCBcIkFuIGlzc3VlIHNvdXJjZSBpcyByZXF1aXJlZC5cIikpfTwvZGl2PlxuXHRcdFx0PGRpdiBpZD1cInByb2JsZW0tc291cmNlLWhlbHAtdGV4dFwiIGNsYXNzPVwiaW5zdHJ1Y3Rpb25zIGhpZGRlblwiPiR7ZXNjYXBlKGxvY2FsaXplKCdkaXNhYmxlRXh0ZW5zaW9uc0xhYmVsVGV4dCcsIFwiVHJ5IHRvIHJlcHJvZHVjZSB0aGUgcHJvYmxlbSBhZnRlciB7MH0uIElmIHRoZSBwcm9ibGVtIG9ubHkgcmVwcm9kdWNlcyB3aGVuIGV4dGVuc2lvbnMgYXJlIGFjdGl2ZSwgaXQgaXMgbGlrZWx5IGFuIGlzc3VlIHdpdGggYW4gZXh0ZW5zaW9uLlwiKSlcblx0XHQucmVwbGFjZSgnezB9JywgKCkgPT4gYDxzcGFuIHRhYkluZGV4PTAgcm9sZT1cImJ1dHRvblwiIGlkPVwiZGlzYWJsZUV4dGVuc2lvbnNcIiBjbGFzcz1cIndvcmtiZW5jaENvbW1hbmRcIj4ke2VzY2FwZShsb2NhbGl6ZSgnZGlzYWJsZUV4dGVuc2lvbnMnLCBcImRpc2FibGluZyBhbGwgZXh0ZW5zaW9ucyBhbmQgcmVsb2FkaW5nIHRoZSB3aW5kb3dcIikpfTwvc3Bhbj5gKX1cblx0XHRcdDwvZGl2PlxuXG5cdFx0XHQ8ZGl2IGlkPVwiZXh0ZW5zaW9uLXNlbGVjdGlvblwiPlxuXHRcdFx0XHQ8bGFiZWwgY2xhc3M9XCJpbmxpbmUtbGFiZWxcIiBmb3I9XCJleHRlbnNpb24tc2VsZWN0b3JcIj4ke2VzY2FwZShsb2NhbGl6ZSgnY2hvb3NlRXh0ZW5zaW9uJywgXCJFeHRlbnNpb25cIikpfSA8c3BhbiBjbGFzcz1cInJlcXVpcmVkLWlucHV0XCI+Kjwvc3Bhbj48L2xhYmVsPlxuXHRcdFx0XHQ8c2VsZWN0IGlkPVwiZXh0ZW5zaW9uLXNlbGVjdG9yXCIgY2xhc3M9XCJpbmxpbmUtZm9ybS1jb250cm9sXCI+XG5cdFx0XHRcdFx0PCEtLSBUbyBiZSBkeW5hbWljYWxseSBmaWxsZWQgLS0+XG5cdFx0XHRcdDwvc2VsZWN0PlxuXHRcdFx0XHQ8ZGl2IGlkPVwiZXh0ZW5zaW9uLXNlbGVjdGlvbi12YWxpZGF0aW9uLWVycm9yXCIgY2xhc3M9XCJ2YWxpZGF0aW9uLWVycm9yIGhpZGRlblwiIHJvbGU9XCJhbGVydFwiPiR7ZXNjYXBlKGxvY2FsaXplKCdleHRlbnNpb25XaXRoTm9uc3RhbmRhcmRCdWdzVXJsJywgXCJUaGUgaXNzdWUgcmVwb3J0ZXIgaXMgdW5hYmxlIHRvIGNyZWF0ZSBpc3N1ZXMgZm9yIHRoaXMgZXh0ZW5zaW9uLiBQbGVhc2UgdmlzaXQgezB9IHRvIHJlcG9ydCBhbiBpc3N1ZS5cIikpXG5cdFx0LnJlcGxhY2UoJ3swfScsICgpID0+IGA8c3BhbiB0YWJJbmRleD0wIHJvbGU9XCJidXR0b25cIiBpZD1cImV4dGVuc2lvbkJ1Z3NMaW5rXCIgY2xhc3M9XCJ3b3JrYmVuY2hDb21tYW5kXCI+PCEtLSBUbyBiZSBkeW5hbWljYWxseSBmaWxsZWQgLS0+PC9zcGFuPmApfTwvZGl2PlxuXHRcdFx0XHQ8ZGl2IGlkPVwiZXh0ZW5zaW9uLXNlbGVjdGlvbi12YWxpZGF0aW9uLWVycm9yLW5vLXVybFwiIGNsYXNzPVwidmFsaWRhdGlvbi1lcnJvciBoaWRkZW5cIiByb2xlPVwiYWxlcnRcIj5cblx0XHRcdFx0XHQke2VzY2FwZShsb2NhbGl6ZSgnZXh0ZW5zaW9uV2l0aE5vQnVnc1VybCcsIFwiVGhlIGlzc3VlIHJlcG9ydGVyIGlzIHVuYWJsZSB0byBjcmVhdGUgaXNzdWVzIGZvciB0aGlzIGV4dGVuc2lvbiwgYXMgaXQgZG9lcyBub3Qgc3BlY2lmeSBhIFVSTCBmb3IgcmVwb3J0aW5nIGlzc3Vlcy4gUGxlYXNlIGNoZWNrIHRoZSBtYXJrZXRwbGFjZSBwYWdlIG9mIHRoaXMgZXh0ZW5zaW9uIHRvIHNlZSBpZiBvdGhlciBpbnN0cnVjdGlvbnMgYXJlIGF2YWlsYWJsZS5cIikpfVxuXHRcdFx0XHQ8L2Rpdj5cblx0XHRcdDwvZGl2PlxuXHRcdDwvZGl2PlxuXG5cdFx0PGRpdiBpZD1cImlzc3VlLXRpdGxlLWNvbnRhaW5lclwiIGNsYXNzPVwiaW5wdXQtZ3JvdXBcIj5cblx0XHRcdDxsYWJlbCBjbGFzcz1cImlubGluZS1sYWJlbFwiIGZvcj1cImlzc3VlLXRpdGxlXCI+JHtlc2NhcGUobG9jYWxpemUoJ2lzc3VlVGl0bGVMYWJlbCcsIFwiVGl0bGVcIikpfSA8c3BhbiBjbGFzcz1cInJlcXVpcmVkLWlucHV0XCI+Kjwvc3Bhbj48L2xhYmVsPlxuXHRcdFx0PGlucHV0IGlkPVwiaXNzdWUtdGl0bGVcIiB0eXBlPVwidGV4dFwiIGNsYXNzPVwiaW5saW5lLWZvcm0tY29udHJvbFwiIHBsYWNlaG9sZGVyPVwiJHtlc2NhcGUobG9jYWxpemUoJ2lzc3VlVGl0bGVSZXF1aXJlZCcsIFwiUGxlYXNlIGVudGVyIGEgdGl0bGUuXCIpKX1cIiByZXF1aXJlZD5cblx0XHRcdDxkaXYgaWQ9XCJpc3N1ZS10aXRsZS1lbXB0eS1lcnJvclwiIGNsYXNzPVwidmFsaWRhdGlvbi1lcnJvciBoaWRkZW5cIiByb2xlPVwiYWxlcnRcIj4ke2VzY2FwZShsb2NhbGl6ZSgndGl0bGVFbXB0eVZhbGlkYXRpb24nLCBcIkEgdGl0bGUgaXMgcmVxdWlyZWQuXCIpKX08L2Rpdj5cblx0XHRcdDxkaXYgaWQ9XCJpc3N1ZS10aXRsZS1sZW5ndGgtdmFsaWRhdGlvbi1lcnJvclwiIGNsYXNzPVwidmFsaWRhdGlvbi1lcnJvciBoaWRkZW5cIiByb2xlPVwiYWxlcnRcIj4ke2VzY2FwZShsb2NhbGl6ZSgndGl0bGVMZW5ndGhWYWxpZGF0aW9uJywgXCJUaGUgdGl0bGUgaXMgdG9vIGxvbmcuXCIpKX08L2Rpdj5cblx0XHRcdDxzbWFsbCBpZD1cInNpbWlsYXItaXNzdWVzXCI+XG5cdFx0XHRcdDwhLS0gVG8gYmUgZHluYW1pY2FsbHkgZmlsbGVkIC0tPlxuXHRcdFx0PC9zbWFsbD5cblx0XHQ8L2Rpdj5cblxuXHQ8L2Rpdj5cblxuXHQ8ZGl2IGNsYXNzPVwiaW5wdXQtZ3JvdXAgZGVzY3JpcHRpb24tc2VjdGlvblwiPlxuXHRcdDxsYWJlbCBmb3I9XCJkZXNjcmlwdGlvblwiIGlkPVwiaXNzdWUtZGVzY3JpcHRpb24tbGFiZWxcIj5cblx0XHRcdDwhLS0gVG8gYmUgZHluYW1pY2FsbHkgZmlsbGVkIC0tPlxuXHRcdDwvbGFiZWw+XG5cdFx0PGRpdiBjbGFzcz1cImluc3RydWN0aW9uc1wiIGlkPVwiaXNzdWUtZGVzY3JpcHRpb24tc3VidGl0bGVcIj5cblx0XHRcdDwhLS0gVG8gYmUgZHluYW1pY2FsbHkgZmlsbGVkIC0tPlxuXHRcdDwvZGl2PlxuXHRcdDxkaXYgY2xhc3M9XCJibG9jay1pbmZvLXRleHRcIj5cblx0XHRcdDx0ZXh0YXJlYSBuYW1lPVwiZGVzY3JpcHRpb25cIiBpZD1cImRlc2NyaXB0aW9uXCIgcGxhY2Vob2xkZXI9XCIke2VzY2FwZShsb2NhbGl6ZSgnZGV0YWlscycsIFwiUGxlYXNlIGVudGVyIGRldGFpbHMuXCIpKX1cIiByZXF1aXJlZD48L3RleHRhcmVhPlxuXHRcdDwvZGl2PlxuXHRcdDxkaXYgaWQ9XCJkZXNjcmlwdGlvbi1lbXB0eS1lcnJvclwiIGNsYXNzPVwidmFsaWRhdGlvbi1lcnJvciBoaWRkZW5cIiByb2xlPVwiYWxlcnRcIj4ke2VzY2FwZShsb2NhbGl6ZSgnZGVzY3JpcHRpb25FbXB0eVZhbGlkYXRpb24nLCBcIkEgZGVzY3JpcHRpb24gaXMgcmVxdWlyZWQuXCIpKX08L2Rpdj5cblx0XHQ8ZGl2IGlkPVwiZGVzY3JpcHRpb24tc2hvcnQtZXJyb3JcIiBjbGFzcz1cInZhbGlkYXRpb24tZXJyb3IgaGlkZGVuXCIgcm9sZT1cImFsZXJ0XCI+JHtlc2NhcGUobG9jYWxpemUoJ2Rlc2NyaXB0aW9uVG9vU2hvcnRWYWxpZGF0aW9uJywgXCJQbGVhc2UgcHJvdmlkZSBhIGxvbmdlciBkZXNjcmlwdGlvbi5cIikpfTwvZGl2PlxuXHQ8L2Rpdj5cblxuXHQ8ZGl2IGNsYXNzPVwic3lzdGVtLWluZm9cIiBpZD1cImJsb2NrLWNvbnRhaW5lclwiPlxuXHRcdDxkaXYgY2xhc3M9XCJibG9jayBibG9jay1leHRlbnNpb24tZGF0YVwiPlxuXHRcdFx0PGlucHV0IGNsYXNzPVwic2VuZC1leHRlbnNpb24tZGF0YVwiIGFyaWEtbGFiZWw9XCIke3NlbmRFeHRlbnNpb25EYXRhfVwiIHR5cGU9XCJjaGVja2JveFwiIGlkPVwiaW5jbHVkZUV4dGVuc2lvbkRhdGFcIiBjaGVja2VkLz5cblx0XHRcdDxsYWJlbCBjbGFzcz1cImV4dGVuc2lvbi1jYXB0aW9uXCIgaWQ9XCJleHRlbnNpb24tY2FwdGlvblwiIGZvcj1cImluY2x1ZGVFeHRlbnNpb25EYXRhXCI+XG5cdFx0XHRcdCR7c2VuZEV4dGVuc2lvbkRhdGF9XG5cdFx0XHRcdDxzcGFuIGlkPVwiZXh0LWxvYWRpbmdcIiBoaWRkZW4+PC9zcGFuPlxuXHRcdFx0XHQ8c3BhbiBjbGFzcz1cImV4dC1wYXJlbnNcIiBoaWRkZW4+KDwvc3Bhbj48YSBocmVmPVwiI1wiIGNsYXNzPVwic2hvd0luZm9cIiBpZD1cImV4dGVuc2lvbi1pZFwiPiR7ZXNjYXBlKGxvY2FsaXplKCdzaG93JywgXCJzaG93XCIpKX08L2E+PHNwYW4gY2xhc3M9XCJleHQtcGFyZW5zXCIgaGlkZGVuPik8L3NwYW4+XG5cdFx0XHRcdDxhIGlkPVwiZXh0ZW5zaW9uLWRhdGEtZG93bmxvYWRcIj4ke2VzY2FwZShsb2NhbGl6ZSgnZG93bmxvYWRFeHRlbnNpb25EYXRhJywgXCJEb3dubG9hZCBFeHRlbnNpb24gRGF0YVwiKSl9PC9hPlxuXHRcdFx0PC9sYWJlbD5cblx0XHRcdDxwcmUgY2xhc3M9XCJibG9jay1pbmZvXCIgaWQ9XCJleHRlbnNpb24tZGF0YVwiIHBsYWNlaG9sZGVyPVwiJHtlc2NhcGUobG9jYWxpemUoJ2V4dGVuc2lvbkRhdGEnLCBcIkV4dGVuc2lvbiBkb2VzIG5vdCBoYXZlIGFkZGl0aW9uYWwgZGF0YSB0byBpbmNsdWRlLlwiKSl9XCIgc3R5bGU9XCJ3aGl0ZS1zcGFjZTogcHJlLXdyYXA7IHVzZXItc2VsZWN0OiB0ZXh0O1wiPlxuXHRcdFx0XHQ8IS0tIFRvIGJlIGR5bmFtaWNhbGx5IGZpbGxlZCAtLT5cblx0XHRcdDwvcHJlPlxuXHRcdDwvZGl2PlxuXG5cdFx0PGRpdiBjbGFzcz1cImJsb2NrIGJsb2NrLXN5c3RlbVwiPlxuXHRcdFx0PGlucHV0IGNsYXNzPVwic2VuZERhdGFcIiBhcmlhLWxhYmVsPVwiJHtzZW5kU3lzdGVtSW5mb0xhYmVsfVwiIHR5cGU9XCJjaGVja2JveFwiIGlkPVwiaW5jbHVkZVN5c3RlbUluZm9cIiBjaGVja2VkLz5cblx0XHRcdDxsYWJlbCBjbGFzcz1cImNhcHRpb25cIiBmb3I9XCJpbmNsdWRlU3lzdGVtSW5mb1wiPlxuXHRcdFx0XHQke3NlbmRTeXN0ZW1JbmZvTGFiZWx9XG5cdFx0XHRcdCg8YSBocmVmPVwiI1wiIGNsYXNzPVwic2hvd0luZm9cIj4ke2VzY2FwZShsb2NhbGl6ZSgnc2hvdycsIFwic2hvd1wiKSl9PC9hPilcblx0XHRcdDwvbGFiZWw+XG5cdFx0XHQ8ZGl2IGNsYXNzPVwiYmxvY2staW5mbyBoaWRkZW5cIiBzdHlsZT1cInVzZXItc2VsZWN0OiB0ZXh0O1wiPlxuXHRcdFx0XHQ8IS0tIFRvIGJlIGR5bmFtaWNhbGx5IGZpbGxlZCAtLT5cblx0XHQ8L2Rpdj5cblx0XHQ8L2Rpdj5cblx0XHQ8ZGl2IGNsYXNzPVwiYmxvY2sgYmxvY2stcHJvY2Vzc1wiPlxuXHRcdFx0PGlucHV0IGNsYXNzPVwic2VuZERhdGFcIiBhcmlhLWxhYmVsPVwiJHtzZW5kUHJvY2Vzc0luZm9MYWJlbH1cIiB0eXBlPVwiY2hlY2tib3hcIiBpZD1cImluY2x1ZGVQcm9jZXNzSW5mb1wiIGNoZWNrZWQvPlxuXHRcdFx0PGxhYmVsIGNsYXNzPVwiY2FwdGlvblwiIGZvcj1cImluY2x1ZGVQcm9jZXNzSW5mb1wiPlxuXHRcdFx0XHQke3NlbmRQcm9jZXNzSW5mb0xhYmVsfVxuXHRcdFx0XHQoPGEgaHJlZj1cIiNcIiBjbGFzcz1cInNob3dJbmZvXCI+JHtlc2NhcGUobG9jYWxpemUoJ3Nob3cnLCBcInNob3dcIikpfTwvYT4pXG5cdFx0XHQ8L2xhYmVsPlxuXHRcdFx0PHByZSBjbGFzcz1cImJsb2NrLWluZm8gaGlkZGVuXCIgc3R5bGU9XCJ1c2VyLXNlbGVjdDogdGV4dDtcIj5cblx0XHRcdFx0PGNvZGU+XG5cdFx0XHRcdDwhLS0gVG8gYmUgZHluYW1pY2FsbHkgZmlsbGVkIC0tPlxuXHRcdFx0XHQ8L2NvZGU+XG5cdFx0XHQ8L3ByZT5cblx0XHQ8L2Rpdj5cblx0XHQ8ZGl2IGNsYXNzPVwiYmxvY2sgYmxvY2std29ya3NwYWNlXCI+XG5cdFx0XHQ8aW5wdXQgY2xhc3M9XCJzZW5kRGF0YVwiIGFyaWEtbGFiZWw9XCIke3NlbmRXb3Jrc3BhY2VJbmZvTGFiZWx9XCIgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJpbmNsdWRlV29ya3NwYWNlSW5mb1wiIGNoZWNrZWQvPlxuXHRcdFx0PGxhYmVsIGNsYXNzPVwiY2FwdGlvblwiIGZvcj1cImluY2x1ZGVXb3Jrc3BhY2VJbmZvXCI+XG5cdFx0XHRcdCR7c2VuZFdvcmtzcGFjZUluZm9MYWJlbH1cblx0XHRcdFx0KDxhIGhyZWY9XCIjXCIgY2xhc3M9XCJzaG93SW5mb1wiPiR7ZXNjYXBlKGxvY2FsaXplKCdzaG93JywgXCJzaG93XCIpKX08L2E+KVxuXHRcdFx0PC9sYWJlbD5cblx0XHRcdDxwcmUgaWQ9XCJzeXN0ZW1JbmZvXCIgY2xhc3M9XCJibG9jay1pbmZvIGhpZGRlblwiIHN0eWxlPVwidXNlci1zZWxlY3Q6IHRleHQ7XCI+XG5cdFx0XHRcdDxjb2RlPlxuXHRcdFx0XHQ8IS0tIFRvIGJlIGR5bmFtaWNhbGx5IGZpbGxlZCAtLT5cblx0XHRcdFx0PC9jb2RlPlxuXHRcdFx0PC9wcmU+XG5cdFx0PC9kaXY+XG5cdFx0PGRpdiBjbGFzcz1cImJsb2NrIGJsb2NrLWV4dGVuc2lvbnNcIj5cblx0XHRcdDxpbnB1dCBjbGFzcz1cInNlbmREYXRhXCIgYXJpYS1sYWJlbD1cIiR7c2VuZEV4dGVuc2lvbnNMYWJlbH1cIiB0eXBlPVwiY2hlY2tib3hcIiBpZD1cImluY2x1ZGVFeHRlbnNpb25zXCIgY2hlY2tlZC8+XG5cdFx0XHQ8bGFiZWwgY2xhc3M9XCJjYXB0aW9uXCIgZm9yPVwiaW5jbHVkZUV4dGVuc2lvbnNcIj5cblx0XHRcdFx0JHtzZW5kRXh0ZW5zaW9uc0xhYmVsfVxuXHRcdFx0XHQoPGEgaHJlZj1cIiNcIiBjbGFzcz1cInNob3dJbmZvXCI+JHtlc2NhcGUobG9jYWxpemUoJ3Nob3cnLCBcInNob3dcIikpfTwvYT4pXG5cdFx0XHQ8L2xhYmVsPlxuXHRcdFx0PGRpdiBpZD1cInN5c3RlbUluZm9cIiBjbGFzcz1cImJsb2NrLWluZm8gaGlkZGVuXCIgc3R5bGU9XCJ1c2VyLXNlbGVjdDogdGV4dDtcIj5cblx0XHRcdFx0PCEtLSBUbyBiZSBkeW5hbWljYWxseSBmaWxsZWQgLS0+XG5cdFx0XHQ8L2Rpdj5cblx0XHQ8L2Rpdj5cblx0XHQ8ZGl2IGNsYXNzPVwiYmxvY2sgYmxvY2stZXhwZXJpbWVudHNcIj5cblx0XHRcdDxpbnB1dCBjbGFzcz1cInNlbmREYXRhXCIgYXJpYS1sYWJlbD1cIiR7c2VuZEV4cGVyaW1lbnRzTGFiZWx9XCIgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJpbmNsdWRlRXhwZXJpbWVudHNcIiBjaGVja2VkLz5cblx0XHRcdDxsYWJlbCBjbGFzcz1cImNhcHRpb25cIiBmb3I9XCJpbmNsdWRlRXhwZXJpbWVudHNcIj5cblx0XHRcdFx0JHtzZW5kRXhwZXJpbWVudHNMYWJlbH1cblx0XHRcdFx0KDxhIGhyZWY9XCIjXCIgY2xhc3M9XCJzaG93SW5mb1wiPiR7ZXNjYXBlKGxvY2FsaXplKCdzaG93JywgXCJzaG93XCIpKX08L2E+KVxuXHRcdFx0PC9sYWJlbD5cblx0XHRcdDxwcmUgY2xhc3M9XCJibG9jay1pbmZvIGhpZGRlblwiIHN0eWxlPVwidXNlci1zZWxlY3Q6IHRleHQ7XCI+XG5cdFx0XHRcdDwhLS0gVG8gYmUgZHluYW1pY2FsbHkgZmlsbGVkIC0tPlxuXHRcdFx0PC9wcmU+XG5cdFx0PC9kaXY+XG5cdFx0PGRpdiBjbGFzcz1cImJsb2NrIGJsb2NrLWFja25vd2xlZGdlbWVudHMgaGlkZGVuXCIgaWQ9XCJ2ZXJzaW9uLWFja25vd2xlZGdlbWVudHNcIj5cblx0XHRcdDxpbnB1dCBjbGFzcz1cInNlbmREYXRhXCIgYXJpYS1sYWJlbD1cIiR7YWNrbm93bGVkZ2VtZW50c0xhYmVsfVwiIHR5cGU9XCJjaGVja2JveFwiIGlkPVwiaW5jbHVkZUFja25vd2xlZGdlbWVudFwiLz5cblx0XHRcdDxsYWJlbCBjbGFzcz1cImNhcHRpb25cIiBmb3I9XCJpbmNsdWRlQWNrbm93bGVkZ2VtZW50XCI+XG5cdFx0XHRcdCR7YWNrbm93bGVkZ2VtZW50c0xhYmVsfVxuXHRcdFx0PC9sYWJlbD5cblx0XHQ8L2Rpdj5cblx0PC9k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
