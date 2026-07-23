using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CustomsValidationResult
{
    public Guid CustvrId { get; set; }

    public Guid CustvrCustomsId { get; set; }

    public Guid? CustvrCustomsItemId { get; set; }

    public string CustvrValidationScope { get; set; } = null!;

    public string? CustvrValidationSource { get; set; }

    public string CustvrResult { get; set; } = null!;

    public string? CustvrCode { get; set; }

    public string? CustvrMessage { get; set; }

    public string CustvrDetail { get; set; } = null!;

    public DateTime CustvrValidatedAt { get; set; }

    public Guid? CustvrValidatedBy { get; set; }

    public virtual CustomsDeclaration CustvrCustoms { get; set; } = null!;

    public virtual CustomsItem? CustvrCustomsItem { get; set; }
}
