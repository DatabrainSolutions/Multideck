using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CustomsParty
{
    public Guid CustpId { get; set; }

    public Guid CustpCustomsId { get; set; }

    public Guid? CustpCustomsItemId { get; set; }

    public string CustpRole { get; set; } = null!;

    public Guid? CustpOrgId { get; set; }

    public string? CustpNameSnapshot { get; set; }

    public string? CustpIdentifierType { get; set; }

    public string? CustpIdentifierValueSnapshot { get; set; }

    public string CustpAddressJson { get; set; } = null!;

    public string? CustpCountryCodeSnapshot { get; set; }

    public int CustpSortOrder { get; set; }

    public DateTime CustpCreatedAt { get; set; }

    public virtual CustomsDeclaration CustpCustoms { get; set; } = null!;

    public virtual CustomsItem? CustpCustomsItem { get; set; }

    public virtual SysCustomsPartyRole CustpRoleNavigation { get; set; } = null!;
}
