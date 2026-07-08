using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmautomationRunStatus
{
    public string CrmautoRunStatusCode { get; set; } = null!;

    public string CrmautoRunStatusName { get; set; } = null!;

    public string? CrmautoRunStatusDescription { get; set; }

    public bool CrmautoRunStatusIsOpen { get; set; }

    public bool CrmautoRunStatusIsFinal { get; set; }

    public bool CrmautoRunStatusIsActive { get; set; }

    public int CrmautoRunStatusSortOrder { get; set; }

    public virtual ICollection<CrmAutomationRunStep> CrmAutomationRunSteps { get; set; } = new List<CrmAutomationRunStep>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRuns { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmDataCaptureSession> CrmDataCaptureSessions { get; set; } = new List<CrmDataCaptureSession>();
}
