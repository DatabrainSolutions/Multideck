using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CustomsDataElement
{
    public Guid CustdeId { get; set; }

    public Guid CustdeCustomsId { get; set; }

    public Guid? CustdeCustomsItemId { get; set; }

    public string? CustdeJurisdictionCode { get; set; }

    public string CustdeElementCode { get; set; } = null!;

    public string? CustdeElementName { get; set; }

    public string CustdeLevel { get; set; } = null!;

    public string? CustdeValueText { get; set; }

    public string CustdeValueJson { get; set; } = null!;

    public string? CustdeSource { get; set; }

    public string? CustdeValidationStatus { get; set; }

    public DateTime CustdeCreatedAt { get; set; }

    public virtual CustomsDeclaration CustdeCustoms { get; set; } = null!;

    public virtual CustomsItem? CustdeCustomsItem { get; set; }

    public virtual SysCustomsJurisdiction? CustdeJurisdictionCodeNavigation { get; set; }
}
