using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteType
{
    public int SysCusQuoteTypeId { get; set; }

    public string? SysCusQuoteTypeName { get; set; }

    public int SysCusQuoteTypeOrder { get; set; }
}
