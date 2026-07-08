using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysMdxpermissionLevel
{
    public string MdxpermissionLevelCode { get; set; } = null!;

    public string MdxpermissionLevelName { get; set; } = null!;

    public string? MdxpermissionLevelDescription { get; set; }

    public int MdxpermissionLevelSortOrder { get; set; }

    public bool MdxpermissionLevelIsActive { get; set; }

    public DateTime MdxpermissionLevelCreatedAt { get; set; }

    public virtual ICollection<MdxShareAgreementScope> MdxShareAgreementScopes { get; set; } = new List<MdxShareAgreementScope>();
}
