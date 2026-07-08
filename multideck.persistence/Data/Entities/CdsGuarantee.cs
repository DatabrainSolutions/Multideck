using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsGuarantee
{
    public Guid CdsgId { get; set; }

    public Guid CdsgCdsid { get; set; }

    public string CdsgGuaranteeType { get; set; } = null!;

    public string? CdsgGuaranteeReference { get; set; }

    public string? CdsgAccessCode { get; set; }

    public decimal? CdsgAmount { get; set; }

    public string? CdsgCurrencyCodeSnapshot { get; set; }

    public string? CdsgOfficeCode { get; set; }

    public DateTime CdsgCreatedAt { get; set; }

    public virtual CdsDeclaration CdsgCds { get; set; } = null!;
}
