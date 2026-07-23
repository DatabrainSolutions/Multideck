using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmPersonalMessageDraftQueue
{
    public Guid? CrmpmsgId { get; set; }

    public Guid? CrmpmsgRunId { get; set; }

    public Guid? CrmpmsgQuickTaskId { get; set; }

    public string? CrmquickTaskTitle { get; set; }

    public string? CrmpmsgMessageIntentCode { get; set; }

    public string? CrmmsgIntentName { get; set; }

    public string? CrmpmsgChannelCode { get; set; }

    public string? CrmpmsgPersonalisationModeCode { get; set; }

    public string? CrmpmsgDecisionStatusCode { get; set; }

    public Guid? CrmpmsgCustomerOrgId { get; set; }

    public string? CrmpmsgCustomerName { get; set; }

    public Guid? CrmpmsgAssignedUserId { get; set; }

    public string? CrmpmsgAssignedUserEmail { get; set; }

    public string? CrmpmsgSubject { get; set; }

    public string? CrmpmsgBodyText { get; set; }

    public decimal? CrmpmsgRepeatRiskScore { get; set; }

    public bool? CrmpmsgIsTemplateBased { get; set; }

    public DateTime? CrmpmsgCreatedAt { get; set; }
}
