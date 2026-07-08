using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowHandoffSummary
{
    public Guid? WorkflowHandoffId { get; set; }

    public Guid? WorkflowHandoffInstanceId { get; set; }

    public Guid? WorkflowHandoffTaskId { get; set; }

    public string? WorkflowHandoffRecordTypeCode { get; set; }

    public Guid? WorkflowHandoffRecordId { get; set; }

    public string? WorkflowHandoffStatusCode { get; set; }

    public bool? WorkflowHandoffStatusIsOpen { get; set; }

    public string? WorkflowHandoffTitle { get; set; }

    public Guid? WorkflowHandoffFromUserId { get; set; }

    public string? WorkflowHandoffFromUserEmail { get; set; }

    public Guid? WorkflowHandoffFromQueueId { get; set; }

    public string? WorkflowHandoffFromQueueName { get; set; }

    public Guid? WorkflowHandoffFromOrgOfficeId { get; set; }

    public string? WorkflowHandoffFromOfficeName { get; set; }

    public Guid? WorkflowHandoffToUserId { get; set; }

    public string? WorkflowHandoffToUserEmail { get; set; }

    public Guid? WorkflowHandoffToQueueId { get; set; }

    public string? WorkflowHandoffToQueueName { get; set; }

    public Guid? WorkflowHandoffToOrgOfficeId { get; set; }

    public string? WorkflowHandoffToOfficeName { get; set; }

    public int? WorkflowHandoffOpenTaskCount { get; set; }

    public DateTime? WorkflowHandoffSentAt { get; set; }

    public DateTime? WorkflowHandoffAcceptedAt { get; set; }

    public DateTime? WorkflowHandoffRejectedAt { get; set; }

    public DateTime? WorkflowHandoffCreatedAt { get; set; }
}
