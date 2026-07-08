using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceScreeningSubject
{
    public Guid TcesubjectId { get; set; }

    public Guid TcesubjectRunId { get; set; }

    public string TcesubjectRoleCode { get; set; } = null!;

    public string TcesubjectEntityTypeCode { get; set; } = null!;

    public string TcesubjectStatusCode { get; set; } = null!;

    public Guid? TcesubjectOrgId { get; set; }

    public Guid? TcesubjectContactId { get; set; }

    public Guid? TcesubjectJobCargoId { get; set; }

    public string TcesubjectName { get; set; } = null!;

    public string? TcesubjectNormalizedName { get; set; }

    public string? TcesubjectAddressText { get; set; }

    public string? TcesubjectCountryCode { get; set; }

    public string? TcesubjectIdentifierType { get; set; }

    public string? TcesubjectIdentifierValue { get; set; }

    public string? TcesubjectVesselImo { get; set; }

    public string? TcesubjectVesselFlagCode { get; set; }

    public string? TcesubjectHscode { get; set; }

    public string? TcesubjectEccncode { get; set; }

    public string? TcesubjectSourceTable { get; set; }

    public Guid? TcesubjectSourceId { get; set; }

    public int TcesubjectMatchCount { get; set; }

    public decimal TcesubjectHighestScore { get; set; }

    public string TcesubjectMetadataJson { get; set; } = null!;

    public DateTime TcesubjectCreatedAt { get; set; }

    public Guid? TcesubjectCreatedBy { get; set; }

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual ICollection<TceComplianceCase> TceComplianceCases { get; set; } = new List<TceComplianceCase>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceOwnershipCheck> TceOwnershipChecks { get; set; } = new List<TceOwnershipCheck>();

    public virtual ICollection<TceScreeningMatch> TceScreeningMatches { get; set; } = new List<TceScreeningMatch>();

    public virtual OrgContact? TcesubjectContact { get; set; }

    public virtual CmpUser? TcesubjectCreatedByNavigation { get; set; }

    public virtual SysTceentityType TcesubjectEntityTypeCodeNavigation { get; set; } = null!;

    public virtual JobCargo? TcesubjectJobCargo { get; set; }

    public virtual OrgMaster? TcesubjectOrg { get; set; }

    public virtual SysTcesubjectRole TcesubjectRoleCodeNavigation { get; set; } = null!;

    public virtual TceScreeningRun TcesubjectRun { get; set; } = null!;

    public virtual SysTcescreeningStatus TcesubjectStatusCodeNavigation { get; set; } = null!;
}
