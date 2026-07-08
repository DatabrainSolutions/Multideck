using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxSharedJobVersion
{
    public Guid MdxjobVersionId { get; set; }

    public Guid MdxjobVersionSharedJobId { get; set; }

    public int MdxjobVersionVersionNo { get; set; }

    public string MdxjobVersionDirectionCode { get; set; } = null!;

    public string MdxjobVersionStatusCode { get; set; } = null!;

    public Guid? MdxjobVersionEnvelopeId { get; set; }

    public string MdxjobVersionSchemaVersion { get; set; } = null!;

    public string MdxjobVersionSnapshotJson { get; set; } = null!;

    public string? MdxjobVersionPayloadHashSha256 { get; set; }

    public string? MdxjobVersionChangeSummary { get; set; }

    public DateTime? MdxjobVersionSentAt { get; set; }

    public DateTime? MdxjobVersionReceivedAt { get; set; }

    public DateTime? MdxjobVersionAppliedAt { get; set; }

    public DateTime MdxjobVersionCreatedAt { get; set; }

    public Guid? MdxjobVersionCreatedBy { get; set; }

    public virtual CmpUser? MdxjobVersionCreatedByNavigation { get; set; }

    public virtual SysMdxshareDirection MdxjobVersionDirectionCodeNavigation { get; set; } = null!;

    public virtual CommFederationEnvelope? MdxjobVersionEnvelope { get; set; }

    public virtual MdxSharedJob MdxjobVersionSharedJob { get; set; } = null!;

    public virtual SysMdxrecordStatus MdxjobVersionStatusCodeNavigation { get; set; } = null!;
}
