using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceOriginDeclaration
{
    public Guid TceoriginId { get; set; }

    public string TceoriginStatusCode { get; set; } = null!;

    public Guid? TceoriginJobId { get; set; }

    public Guid? TceoriginJobCargoId { get; set; }

    public Guid? TceoriginCustomerOrgId { get; set; }

    public Guid? TceoriginProducerOrgId { get; set; }

    public Guid? TceoriginExporterOrgId { get; set; }

    public string TceoriginGoodsDescription { get; set; } = null!;

    public string? TceoriginHscode { get; set; }

    public string? TceoriginOriginCountryCode { get; set; }

    public string? TceoriginStatementText { get; set; }

    public Guid? TceoriginEvidenceDocumentId { get; set; }

    public DateOnly? TceoriginEvidenceExpiresAt { get; set; }

    public Guid? TceoriginAitaskRunId { get; set; }

    public Guid? TceoriginReviewedBy { get; set; }

    public DateTime? TceoriginReviewedAt { get; set; }

    public string TceoriginMetadataJson { get; set; } = null!;

    public DateTime TceoriginCreatedAt { get; set; }

    public Guid? TceoriginCreatedBy { get; set; }

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TcePreferenceClaim> TcePreferenceClaims { get; set; } = new List<TcePreferenceClaim>();

    public virtual AiTaskRun? TceoriginAitaskRun { get; set; }

    public virtual CmpUser? TceoriginCreatedByNavigation { get; set; }

    public virtual OrgMaster? TceoriginCustomerOrg { get; set; }

    public virtual JobDocument? TceoriginEvidenceDocument { get; set; }

    public virtual OrgMaster? TceoriginExporterOrg { get; set; }

    public virtual JobHeader? TceoriginJob { get; set; }

    public virtual JobCargo? TceoriginJobCargo { get; set; }

    public virtual OrgMaster? TceoriginProducerOrg { get; set; }

    public virtual CmpUser? TceoriginReviewedByNavigation { get; set; }

    public virtual SysTceoriginStatus TceoriginStatusCodeNavigation { get; set; } = null!;
}
