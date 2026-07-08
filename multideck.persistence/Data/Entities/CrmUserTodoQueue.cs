using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmUserTodoQueue
{
    public Guid? CrmquickTaskId { get; set; }

    public string? CrmquickTaskTaskTypeCode { get; set; }

    public string? CrmquickTaskTypeName { get; set; }

    public string? CrmquickTaskStatusCode { get; set; }

    public string? CrmquickTaskDecisionStatusCode { get; set; }

    public Guid? CrmquickTaskAssignedUserId { get; set; }

    public string? CrmquickTaskAssignedUserEmail { get; set; }

    public string? CrmquickTaskTitle { get; set; }

    public string? CrmquickTaskDescription { get; set; }

    public string? CrmquickTaskPriorityCode { get; set; }

    public DateTime? CrmquickTaskDueAt { get; set; }

    public DateTime? CrmquickTaskSnoozedUntil { get; set; }

    public Guid? CrmquickTaskCustomerOrgId { get; set; }

    public string? CrmquickTaskCustomerName { get; set; }

    public Guid? CrmquickTaskAccountId { get; set; }

    public Guid? CrmquickTaskLeadId { get; set; }

    public Guid? CrmquickTaskOpportunityId { get; set; }

    public Guid? CrmquickTaskQuoteFollowupId { get; set; }

    public Guid? CrmquickTaskCallReviewId { get; set; }

    public Guid? CrmquickTaskJobId { get; set; }

    public Guid? CrmquickTaskWorkflowTaskId { get; set; }

    public long? CrmquickTaskOptionCount { get; set; }

    public long? CrmquickTaskPendingDraftCount { get; set; }

    public DateTime? CrmquickTaskCreatedAt { get; set; }
}
