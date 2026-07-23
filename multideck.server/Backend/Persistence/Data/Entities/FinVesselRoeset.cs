using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinVesselRoeset
{
    public Guid FinvesselRoeId { get; set; }

    public Guid? FinvesselRoeJobId { get; set; }

    public Guid? FinvesselRoeJobLegId { get; set; }

    public string? FinvesselRoeVesselNameSnapshot { get; set; }

    public string? FinvesselRoeVoyageFlightNo { get; set; }

    public Guid? FinvesselRoeCarrierOrgId { get; set; }

    public string? FinvesselRoeModeCode { get; set; }

    public string? FinvesselRoeDirectionCode { get; set; }

    public string FinvesselRoeSourceTypeCode { get; set; } = null!;

    public DateOnly FinvesselRoeEffectiveDate { get; set; }

    public string FinvesselRoeStatusCode { get; set; } = null!;

    public string? FinvesselRoeApiProviderRef { get; set; }

    public DateTime? FinvesselRoeApprovedAt { get; set; }

    public Guid? FinvesselRoeApprovedBy { get; set; }

    public DateTime FinvesselRoeCreatedAt { get; set; }

    public Guid? FinvesselRoeCreatedBy { get; set; }

    public virtual ICollection<FinVesselRoeline> FinVesselRoelines { get; set; } = new List<FinVesselRoeline>();

    public virtual CmpUser? FinvesselRoeApprovedByNavigation { get; set; }

    public virtual OrgMaster? FinvesselRoeCarrierOrg { get; set; }

    public virtual CmpUser? FinvesselRoeCreatedByNavigation { get; set; }

    public virtual JobHeader? FinvesselRoeJob { get; set; }
}
