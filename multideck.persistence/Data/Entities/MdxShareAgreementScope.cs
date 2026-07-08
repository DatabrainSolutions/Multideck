using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxShareAgreementScope
{
    public Guid MdxscopeId { get; set; }

    public Guid MdxscopeAgreementId { get; set; }

    public string MdxscopeDataScopeCode { get; set; } = null!;

    public string MdxscopeDirectionCode { get; set; } = null!;

    public string MdxscopePermissionLevelCode { get; set; } = null!;

    public bool MdxscopeAutoAcceptInbound { get; set; }

    public bool MdxscopeRequiresReview { get; set; }

    public string MdxscopeFieldAllowListJson { get; set; } = null!;

    public string MdxscopeFieldDenyListJson { get; set; } = null!;

    public bool MdxscopeIsEnabled { get; set; }

    public DateTime MdxscopeCreatedAt { get; set; }

    public virtual MdxShareAgreement MdxscopeAgreement { get; set; } = null!;

    public virtual SysMdxdataScope MdxscopeDataScopeCodeNavigation { get; set; } = null!;

    public virtual SysMdxshareDirection MdxscopeDirectionCodeNavigation { get; set; } = null!;

    public virtual SysMdxpermissionLevel MdxscopePermissionLevelCodeNavigation { get; set; } = null!;
}
