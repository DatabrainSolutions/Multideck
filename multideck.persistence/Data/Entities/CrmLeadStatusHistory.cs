using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmLeadStatusHistory
{
    public Guid CrmleadStatusId { get; set; }

    public Guid CrmleadStatusLeadId { get; set; }

    public string? CrmleadStatusFromStatusCode { get; set; }

    public string CrmleadStatusToStatusCode { get; set; } = null!;

    public string? CrmleadStatusReason { get; set; }

    public DateTime CrmleadStatusChangedAt { get; set; }

    public Guid? CrmleadStatusChangedBy { get; set; }

    public Guid? CrmleadStatusSourceAiTaskRunId { get; set; }

    public virtual CmpUser? CrmleadStatusChangedByNavigation { get; set; }

    public virtual SysCrmleadStatus? CrmleadStatusFromStatusCodeNavigation { get; set; }

    public virtual CrmLead CrmleadStatusLead { get; set; } = null!;

    public virtual AiTaskRun? CrmleadStatusSourceAiTaskRun { get; set; }

    public virtual SysCrmleadStatus CrmleadStatusToStatusCodeNavigation { get; set; } = null!;
}
