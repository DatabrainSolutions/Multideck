using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysMdxshareDirection
{
    public string MdxshareDirectionCode { get; set; } = null!;

    public string MdxshareDirectionName { get; set; } = null!;

    public string? MdxshareDirectionDescription { get; set; }

    public int MdxshareDirectionSortOrder { get; set; }

    public bool MdxshareDirectionIsActive { get; set; }

    public DateTime MdxshareDirectionCreatedAt { get; set; }

    public virtual ICollection<MdxDataChangeEvent> MdxDataChangeEvents { get; set; } = new List<MdxDataChangeEvent>();

    public virtual ICollection<MdxShareAgreementScope> MdxShareAgreementScopes { get; set; } = new List<MdxShareAgreementScope>();

    public virtual ICollection<MdxShareAgreement> MdxShareAgreements { get; set; } = new List<MdxShareAgreement>();

    public virtual ICollection<MdxSharedJobVersion> MdxSharedJobVersions { get; set; } = new List<MdxSharedJobVersion>();

    public virtual ICollection<MdxSharedJob> MdxSharedJobs { get; set; } = new List<MdxSharedJob>();
}
