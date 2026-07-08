using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmLeadWorklist
{
    public Guid? CrmleadId { get; set; }

    public string? CrmleadCompanyName { get; set; }

    public string? CrmleadPersonName { get; set; }

    public string? CrmleadEmail { get; set; }

    public string? CrmleadPhone { get; set; }

    public Guid? CrmleadOrgId { get; set; }

    public string? CrmleadOrgName { get; set; }

    public string? CrmleadStatusCode { get; set; }

    public string? CrmleadStatusName { get; set; }

    public string? CrmleadRatingCode { get; set; }

    public string? CrmleadSourceCode { get; set; }

    public Guid? CrmleadOwnerUserId { get; set; }

    public string? CrmleadOwnerEmail { get; set; }

    public string? CrmleadModeCode { get; set; }

    public string? CrmleadTradeLane { get; set; }

    public string? CrmleadServiceInterest { get; set; }

    public decimal? CrmleadScore { get; set; }

    public decimal? CrmleadAiprobabilityToConvert { get; set; }

    public DateTime? CrmleadFirstResponseDueAt { get; set; }

    public DateTime? CrmleadFirstRespondedAt { get; set; }

    public DateTime? CrmleadNextActionDueAt { get; set; }

    public DateTime? CrmleadLastInteractionAt { get; set; }

    public DateTime? CrmleadCreatedAt { get; set; }
}
