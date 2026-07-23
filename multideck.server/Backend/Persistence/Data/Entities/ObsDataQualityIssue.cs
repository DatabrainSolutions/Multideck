using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ObsDataQualityIssue
{
    public Guid ObsdataIssueId { get; set; }

    public string? ObsdataIssueModuleCode { get; set; }

    public string ObsdataIssueSourceTable { get; set; } = null!;

    public Guid? ObsdataIssueSourceId { get; set; }

    public string? ObsdataIssueFieldName { get; set; }

    public string ObsdataIssueSeverityCode { get; set; } = null!;

    public string ObsdataIssueStatusCode { get; set; } = null!;

    public string ObsdataIssueTitle { get; set; } = null!;

    public string? ObsdataIssueMessage { get; set; }

    public string ObsdataIssueSuggestedFixJson { get; set; } = null!;

    public DateTime? ObsdataIssueResolvedAt { get; set; }

    public DateTime ObsdataIssueCreatedAt { get; set; }

    public virtual SysSubmoduleCode? ObsdataIssueModuleCodeNavigation { get; set; }

    public virtual SysObseventSeverity ObsdataIssueSeverityCodeNavigation { get; set; } = null!;

    public virtual SysObsqueueStatus ObsdataIssueStatusCodeNavigation { get; set; } = null!;
}
