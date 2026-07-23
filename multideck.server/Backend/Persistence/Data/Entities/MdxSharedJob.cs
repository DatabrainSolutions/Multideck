using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxSharedJob
{
    public Guid MdxsharedJobId { get; set; }

    public Guid MdxsharedJobAgreementId { get; set; }

    public Guid MdxsharedJobPeerId { get; set; }

    public string MdxsharedJobDirectionCode { get; set; } = null!;

    public string MdxsharedJobStatusCode { get; set; } = null!;

    public Guid? MdxsharedJobLocalJobId { get; set; }

    public string? MdxsharedJobLocalJobNumberSnapshot { get; set; }

    public string? MdxsharedJobRemoteJobId { get; set; }

    public string? MdxsharedJobRemoteJobNumber { get; set; }

    public string? MdxsharedJobRemoteOfficeSnapshot { get; set; }

    public string? MdxsharedJobLocalRoleCode { get; set; }

    public string? MdxsharedJobRemoteRoleCode { get; set; }

    public string? MdxsharedJobPrimaryReference { get; set; }

    public string? MdxsharedJobBookingReference { get; set; }

    public string? MdxsharedJobHouseBillReference { get; set; }

    public string? MdxsharedJobMasterBillReference { get; set; }

    public string? MdxsharedJobTransportModeCode { get; set; }

    public string? MdxsharedJobDirectionSnapshot { get; set; }

    public string? MdxsharedJobOriginUnlocode { get; set; }

    public string? MdxsharedJobOriginNameSnapshot { get; set; }

    public string? MdxsharedJobDestinationUnlocode { get; set; }

    public string? MdxsharedJobDestinationNameSnapshot { get; set; }

    public string? MdxsharedJobCurrentLocationUnlocode { get; set; }

    public string? MdxsharedJobCurrentLocationNameSnapshot { get; set; }

    public DateOnly? MdxsharedJobReadyDate { get; set; }

    public DateOnly? MdxsharedJobRequiredDeliveryDate { get; set; }

    public DateTime? MdxsharedJobPredictedDeliveryAt { get; set; }

    public string? MdxsharedJobTrackingStatus { get; set; }

    public DateTime? MdxsharedJobLastLocalChangeAt { get; set; }

    public DateTime? MdxsharedJobLastRemoteChangeAt { get; set; }

    public DateTime? MdxsharedJobLastOutboundSyncAt { get; set; }

    public DateTime? MdxsharedJobLastInboundSyncAt { get; set; }

    public string? MdxsharedJobLastOutboundHashSha256 { get; set; }

    public string? MdxsharedJobLastInboundHashSha256 { get; set; }

    public string MdxsharedJobCurrentSnapshotJson { get; set; } = null!;

    public string MdxsharedJobPolicyJson { get; set; } = null!;

    public DateTime MdxsharedJobCreatedAt { get; set; }

    public Guid? MdxsharedJobCreatedBy { get; set; }

    public DateTime MdxsharedJobUpdatedAt { get; set; }

    public Guid? MdxsharedJobUpdatedBy { get; set; }

    public bool MdxsharedJobIsDeleted { get; set; }

    public virtual ICollection<MdxConflictCase> MdxConflictCases { get; set; } = new List<MdxConflictCase>();

    public virtual ICollection<MdxDataChangeEvent> MdxDataChangeEvents { get; set; } = new List<MdxDataChangeEvent>();

    public virtual ICollection<MdxInboundReviewItem> MdxInboundReviewItems { get; set; } = new List<MdxInboundReviewItem>();

    public virtual ICollection<MdxSharedCargo> MdxSharedCargos { get; set; } = new List<MdxSharedCargo>();

    public virtual ICollection<MdxSharedCustom> MdxSharedCustoms { get; set; } = new List<MdxSharedCustom>();

    public virtual ICollection<MdxSharedDocument> MdxSharedDocuments { get; set; } = new List<MdxSharedDocument>();

    public virtual ICollection<MdxSharedEquipment> MdxSharedEquipments { get; set; } = new List<MdxSharedEquipment>();

    public virtual ICollection<MdxSharedJobVersion> MdxSharedJobVersions { get; set; } = new List<MdxSharedJobVersion>();

    public virtual ICollection<MdxSharedMilestone> MdxSharedMilestones { get; set; } = new List<MdxSharedMilestone>();

    public virtual ICollection<MdxSharedParty> MdxSharedParties { get; set; } = new List<MdxSharedParty>();

    public virtual ICollection<MdxSharedRouteLeg> MdxSharedRouteLegs { get; set; } = new List<MdxSharedRouteLeg>();

    public virtual ICollection<MdxSharedTrackingEvent> MdxSharedTrackingEvents { get; set; } = new List<MdxSharedTrackingEvent>();

    public virtual MdxShareAgreement MdxsharedJobAgreement { get; set; } = null!;

    public virtual CmpUser? MdxsharedJobCreatedByNavigation { get; set; }

    public virtual SysMdxshareDirection MdxsharedJobDirectionCodeNavigation { get; set; } = null!;

    public virtual JobHeader? MdxsharedJobLocalJob { get; set; }

    public virtual SysMdxpartnerRole? MdxsharedJobLocalRoleCodeNavigation { get; set; }

    public virtual CommFederationPeer MdxsharedJobPeer { get; set; } = null!;

    public virtual SysMdxpartnerRole? MdxsharedJobRemoteRoleCodeNavigation { get; set; }

    public virtual SysMdxrecordStatus MdxsharedJobStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? MdxsharedJobUpdatedByNavigation { get; set; }
}
