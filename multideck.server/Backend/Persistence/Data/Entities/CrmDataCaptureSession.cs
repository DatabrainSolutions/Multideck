using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmDataCaptureSession
{
    public Guid CrmdataCapSessionId { get; set; }

    public Guid CrmdataCapSessionRunId { get; set; }

    public string CrmdataCapSessionMethodCode { get; set; } = null!;

    public string CrmdataCapSessionStatusCode { get; set; } = null!;

    public Guid? CrmdataCapSessionAssignedUserId { get; set; }

    public DateTime CrmdataCapSessionStartedAt { get; set; }

    public DateTime? CrmdataCapSessionCompletedAt { get; set; }

    public string CrmdataCapSessionContextJson { get; set; } = null!;

    public virtual ICollection<CrmDataCaptureResponse> CrmDataCaptureResponses { get; set; } = new List<CrmDataCaptureResponse>();

    public virtual CmpUser? CrmdataCapSessionAssignedUser { get; set; }

    public virtual SysCrmdataCaptureMethod CrmdataCapSessionMethodCodeNavigation { get; set; } = null!;

    public virtual CrmAutomationRun CrmdataCapSessionRun { get; set; } = null!;

    public virtual SysCrmautomationRunStatus CrmdataCapSessionStatusCodeNavigation { get; set; } = null!;
}
