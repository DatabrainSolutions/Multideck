using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysMdxpartnerRole
{
    public string MdxpartnerRoleCode { get; set; } = null!;

    public string MdxpartnerRoleName { get; set; } = null!;

    public string? MdxpartnerRoleDescription { get; set; }

    public int MdxpartnerRoleSortOrder { get; set; }

    public bool MdxpartnerRoleIsActive { get; set; }

    public DateTime MdxpartnerRoleCreatedAt { get; set; }

    public virtual ICollection<MdxShareAgreement> MdxShareAgreementMdxagreementLocalRoleCodeNavigations { get; set; } = new List<MdxShareAgreement>();

    public virtual ICollection<MdxShareAgreement> MdxShareAgreementMdxagreementRemoteRoleCodeNavigations { get; set; } = new List<MdxShareAgreement>();

    public virtual ICollection<MdxSharedJob> MdxSharedJobMdxsharedJobLocalRoleCodeNavigations { get; set; } = new List<MdxSharedJob>();

    public virtual ICollection<MdxSharedJob> MdxSharedJobMdxsharedJobRemoteRoleCodeNavigations { get; set; } = new List<MdxSharedJob>();
}
