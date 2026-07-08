using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmLeadQualification
{
    public Guid CrmleadQualId { get; set; }

    public Guid CrmleadQualLeadId { get; set; }

    public bool? CrmleadQualHasAuthority { get; set; }

    public bool? CrmleadQualHasBudget { get; set; }

    public bool? CrmleadQualHasNeed { get; set; }

    public bool? CrmleadQualHasTimeline { get; set; }

    public string? CrmleadQualShipmentFrequency { get; set; }

    public int? CrmleadQualEstimatedAnnualShipments { get; set; }

    public decimal? CrmleadQualEstimatedAnnualRevenueAmount { get; set; }

    public string? CrmleadQualEstimatedAnnualRevenueCurrencyCode { get; set; }

    public string? CrmleadQualCurrentProvider { get; set; }

    public string? CrmleadQualPainPoints { get; set; }

    public string? CrmleadQualSuccessCriteria { get; set; }

    public decimal? CrmleadQualQualificationScore { get; set; }

    public DateTime? CrmleadQualQualifiedAt { get; set; }

    public Guid? CrmleadQualQualifiedBy { get; set; }

    public string CrmleadQualMetadataJson { get; set; } = null!;

    public DateTime CrmleadQualCreatedAt { get; set; }

    public Guid? CrmleadQualCreatedBy { get; set; }

    public virtual CmpUser? CrmleadQualCreatedByNavigation { get; set; }

    public virtual CrmLead CrmleadQualLead { get; set; } = null!;

    public virtual CmpUser? CrmleadQualQualifiedByNavigation { get; set; }
}
