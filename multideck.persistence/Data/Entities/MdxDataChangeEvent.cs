using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxDataChangeEvent
{
    public Guid MdxeventId { get; set; }

    public Guid MdxeventSharedJobId { get; set; }

    public string MdxeventDataScopeCode { get; set; } = null!;

    public string MdxeventEventTypeCode { get; set; } = null!;

    public string MdxeventStatusCode { get; set; } = null!;

    public string MdxeventDirectionCode { get; set; } = null!;

    public Guid? MdxeventEnvelopeId { get; set; }

    public string? MdxeventSourceTable { get; set; }

    public Guid? MdxeventSourceId { get; set; }

    public string? MdxeventRemoteSourceId { get; set; }

    public string? MdxeventFieldPath { get; set; }

    public string? MdxeventOldValueJson { get; set; }

    public string? MdxeventNewValueJson { get; set; }

    public string? MdxeventMessage { get; set; }

    public bool MdxeventRequiresReview { get; set; }

    public DateTime MdxeventCreatedAt { get; set; }

    public Guid? MdxeventCreatedBy { get; set; }

    public virtual ICollection<MdxConflictCase> MdxConflictCases { get; set; } = new List<MdxConflictCase>();

    public virtual ICollection<MdxInboundReviewItem> MdxInboundReviewItems { get; set; } = new List<MdxInboundReviewItem>();

    public virtual CmpUser? MdxeventCreatedByNavigation { get; set; }

    public virtual SysMdxdataScope MdxeventDataScopeCodeNavigation { get; set; } = null!;

    public virtual SysMdxshareDirection MdxeventDirectionCodeNavigation { get; set; } = null!;

    public virtual CommFederationEnvelope? MdxeventEnvelope { get; set; }

    public virtual SysMdxeventType MdxeventEventTypeCodeNavigation { get; set; } = null!;

    public virtual MdxSharedJob MdxeventSharedJob { get; set; } = null!;

    public virtual SysMdxrecordStatus MdxeventStatusCodeNavigation { get; set; } = null!;
}
