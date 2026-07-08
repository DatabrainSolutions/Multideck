using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiTestRun
{
    public Guid EditestRunId { get; set; }

    public Guid EditestRunTestCaseId { get; set; }

    public string EditestRunStatusCode { get; set; } = null!;

    public string EditestRunActualCanonicalJson { get; set; } = null!;

    public int EditestRunIssueCount { get; set; }

    public string? EditestRunErrorText { get; set; }

    public DateTime EditestRunStartedAt { get; set; }

    public DateTime? EditestRunCompletedAt { get; set; }

    public Guid? EditestRunCreatedBy { get; set; }

    public virtual CmpUser? EditestRunCreatedByNavigation { get; set; }

    public virtual SysEdimessageStatus EditestRunStatusCodeNavigation { get; set; } = null!;

    public virtual EdiTestCase EditestRunTestCase { get; set; } = null!;
}
