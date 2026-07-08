using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommInboxWorklist
{
    public Guid? CommThreadId { get; set; }

    public string? CommThreadSubject { get; set; }

    public string? CommThreadStatusCode { get; set; }

    public string? CommThreadPrimaryChannelCode { get; set; }

    public string? CommThreadPriorityCode { get; set; }

    public string? CommThreadSensitivityCode { get; set; }

    public Guid? CommThreadOrgOfficeId { get; set; }

    public Guid? CommThreadLegalEntityId { get; set; }

    public Guid? CommThreadBrandId { get; set; }

    public Guid? CommThreadCustomerOrgId { get; set; }

    public Guid? CommThreadAssignedUserId { get; set; }

    public string? CommThreadAssignedUserEmail { get; set; }

    public Guid? CommThreadAssignedGroupId { get; set; }

    public string? CommThreadPrimaryTargetTable { get; set; }

    public Guid? CommThreadPrimaryTargetId { get; set; }

    public DateTime? CommThreadLastMessageAt { get; set; }

    public DateTime? CommThreadFirstResponseDueAt { get; set; }

    public DateTime? CommThreadNextActionDueAt { get; set; }

    public string? CommThreadAiintent { get; set; }

    public string? CommThreadAisummary { get; set; }

    public int? CommThreadMessageCount { get; set; }

    public int? CommThreadParticipantCount { get; set; }

    public DateTime? CommThreadLastInboundAt { get; set; }

    public DateTime? CommThreadLastOutboundAt { get; set; }

    public bool? CommThreadIsOverdue { get; set; }
}
