using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmactivityType
{
    public string CrmactTypeCode { get; set; } = null!;

    public string CrmactTypeName { get; set; } = null!;

    public string? CrmactTypeDescription { get; set; }

    public string? CrmactTypeChannelCode { get; set; }

    public bool CrmactTypeIsCustomerTouch { get; set; }

    public bool CrmactTypeIsActive { get; set; }

    public int CrmactTypeSortOrder { get; set; }

    public virtual ICollection<CrmActivity> CrmActivities { get; set; } = new List<CrmActivity>();

    public virtual ICollection<CrmActivityWorkflowRule> CrmActivityWorkflowRules { get; set; } = new List<CrmActivityWorkflowRule>();

    public virtual ICollection<CrmQuoteFollowupAttempt> CrmQuoteFollowupAttempts { get; set; } = new List<CrmQuoteFollowupAttempt>();
}
