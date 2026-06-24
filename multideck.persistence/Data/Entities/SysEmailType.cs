using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysEmailType
{
    public int SysEmailTypeId { get; set; }

    public string SysEmailTypeName { get; set; } = null!;

    public int SysEmailTypeGrouping { get; set; }
}
