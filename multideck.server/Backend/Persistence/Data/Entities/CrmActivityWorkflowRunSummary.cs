using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmActivityWorkflowRunSummary
{
    public Guid? CrmawrunId { get; set; }

    public string? CrmawrunTriggerTypeCode { get; set; }

    public string? CrmactTrigName { get; set; }

    public string? CrmawrunSourceTable { get; set; }

    public Guid? CrmawrunSourceId { get; set; }

    public Guid? CrmawrunCustomerOrgId { get; set; }

    public string? CrmawrunCustomerName { get; set; }

    public Guid? CrmawrunOwnerUserId { get; set; }

    public string? CrmawrunOwnerEmail { get; set; }

    public string? CrmawrunStatusCode { get; set; }

    public int? CrmawrunGeneratedQuickTaskCount { get; set; }

    public int? CrmawrunGeneratedMessageDraftCount { get; set; }

    public long? CrmawrunQuickTaskCount { get; set; }

    public long? CrmawrunMessageDraftCount { get; set; }

    public DateTime? CrmawrunCreatedAt { get; set; }
}
